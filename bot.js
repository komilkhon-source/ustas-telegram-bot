import { Telegraf, Markup, session } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { translations, regions } from './translations.js';

// Load .env from result directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Debug: Print environment variables
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? 'Provided' : 'Missing');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);

const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token || !supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables. Please check your .env file.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const bot = new Telegraf(token);
bot.use(session());

// Steps
const STEPS = {
    LANGUAGE: 'LANGUAGE',
    EMAIL: 'EMAIL',
    PASSWORD: 'PASSWORD',
    CONFIRM_PASSWORD: 'CONFIRM_PASSWORD',
    NAME: 'NAME',
    JOB_TITLE: 'JOB_TITLE',
    PHONE: 'PHONE',
    REGION: 'REGION',
    LOCATION: 'LOCATION',
    BIO: 'BIO',
    EXPERIENCE: 'EXPERIENCE',
    SOCIAL_MEDIA: 'SOCIAL_MEDIA',
    PROFILE_PIC: 'PROFILE_PIC',
    COMPLETED: 'COMPLETED'
};

// Helper to get text
const getText = (ctx, key, params = {}) => {
    const lang = ctx.session?.lang || 'ru'; // Default to Russian if undefined
    let text = translations[lang][key] || translations['ru'][key] || key;

    // Replace params
    Object.keys(params).forEach(param => {
        text = text.replace(`{${param}}`, params[param]);
    });
    return text;
};

// Start Command
bot.command('start', async (ctx) => {
    console.log('🔄 /start command received!');
    try {
        const telegramId = ctx.from.id;

        // Check if user already exists and is linked
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (profile && profile.user_id) {
            // Determine lang from profile if possible, or default
            // For now, we will just greet them.
            // (If we stored lang in DB, we could load it here)
            return ctx.reply(`Welcome back, ${profile.full_name || 'User'}! You are already logged in.`);
        }

        // Initialize session
        ctx.session = { step: STEPS.LANGUAGE };

        await ctx.reply('Пожалуйста, выберите язык / Iltimos, tilni tanlang:',
            Markup.keyboard([['🇺🇿 O\'zbekcha', '🇷🇺 Русский']]).oneTime().resize()
        );

    } catch (err) {
        console.error('Error in start:', err);
        ctx.reply('An error occurred. Please try again.');
    }
});

// Helper to update profile with error handling
async function updateProfile(ctx, updates) {
    // NOTE: Profiles table not used for job seekers on website
    // Just store data in session for now, will save to job_seekers at the end
    console.log(`📝 Storing ${Object.keys(updates).join(', ')} in session for ${ctx.from.id}`);
    return true;

    /*
    const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('telegram_id', ctx.from.id);

    if (error) {
        console.error(`❌ Error updating profile [${Object.keys(updates).join(', ')}]:`, JSON.stringify(error, null, 2));
        await ctx.reply(`⚠️ Error saving data (${error.message}). Please try again.`);
        return false;
    }
    console.log(`✅ Updated profile [${Object.keys(updates).join(', ')}] for ${ctx.from.id}`);
    return true;
    */
}

// Helper to save Final Job Seeker Data
async function saveJobSeeker(ctx) {
    const data = ctx.session;
    const { data: insertedData, error } = await supabase.from('job_seekers').insert({
        created_by: data.email, // Use email to match website behavior
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        job_title: data.job_title,
        region: data.region,
        location: data.location,
        city: data.city,
        bio: data.bio,
        years_experience: data.years_experience,
        instagram: data.instagram,
        facebook: data.facebook,
        telegram: data.telegram,
        profile_image: data.profile_image // URL or File ID
    }).select().single();

    if (error) {
        console.error('❌ Error saving to job_seekers:', error);
        await ctx.reply(`⚠️ Note: Error saving to job seekers list (${error.message}). Profile is saved though.`);
        return null;
    } else {
        console.log('✅ Saved to job_seekers', insertedData);
        return insertedData;
    }
}

// ... event handlers ...

// function removed

// Handle Text Messages
bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) {
        return ctx.reply('Topish uchun /start ni bosing. / Пожалуйста, нажмите /start.');
    }

    const text = ctx.message.text.trim();
    const step = ctx.session.step;

    try {
        switch (step) {
            case STEPS.LANGUAGE:
                if (text === "🇺🇿 O'zbekcha") {
                    ctx.session.lang = 'uz';
                } else if (text === "🇷🇺 Русский") {
                    ctx.session.lang = 'ru';
                } else {
                    return ctx.reply('Please select using buttons / Iltimos tugmalardan foydalaning');
                }

                ctx.session.step = STEPS.EMAIL;
                await ctx.reply(getText(ctx, 'welcome_initial'), Markup.removeKeyboard());
                break;

            case STEPS.EMAIL:
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(text)) {
                    return ctx.reply(getText(ctx, 'email_invalid'));
                }
                // Normalize email to lowercase to avoid case sensitivity issues
                ctx.session.email = text.toLowerCase();
                ctx.session.step = STEPS.PASSWORD;
                await ctx.reply(getText(ctx, 'email_accepted'));
                break;

            case STEPS.PASSWORD:
                if (text.length < 8) {
                    try { await ctx.deleteMessage(); } catch (e) { }
                    return ctx.reply(getText(ctx, 'password_short'));
                }
                ctx.session.password = text;
                ctx.session.step = STEPS.CONFIRM_PASSWORD;
                try { await ctx.deleteMessage(); } catch (e) { }
                await ctx.reply(getText(ctx, 'confirm_password'));
                break;

            case STEPS.CONFIRM_PASSWORD:
                try { await ctx.deleteMessage(); } catch (e) { }
                if (text !== ctx.session.password) {
                    return ctx.reply(getText(ctx, 'password_mismatch'));
                    ctx.session.step = STEPS.PASSWORD;
                    return;
                }

                await ctx.reply(getText(ctx, 'creating_account'));

                const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                    email: ctx.session.email,
                    password: ctx.session.password,
                    email_confirm: true
                });

                if (authError) {
                    console.error('Auth Error:', authError);
                    if (authError.message.includes('already registered')) {
                        return ctx.reply(getText(ctx, 'email_registered'));
                    }
                    return ctx.reply(getText(ctx, 'account_error', { error: authError.message }));
                }

                const userId = authData.user.id;

                // NOTE: Website doesn't create profiles table records for job seekers
                // Only the auth user and job_seekers table are created
                // Commenting out profiles table creation to match website behavior
                /*
                const { error: profileError } = await supabase.from('profiles').upsert({
                    telegram_id: ctx.from.id,
                    id: userId,
                    username: ctx.from.username,
                    full_name: '',
                    user_type: 'worker' // Default to worker/craftsman
                }, { onConflict: 'telegram_id' });

                if (profileError) {
                    console.error('Profile Error Details:', JSON.stringify(profileError, null, 2));
                    return ctx.reply(getText(ctx, 'profile_error', { error: profileError.message }));
                }
                */

                ctx.session.userId = userId;
                ctx.session.step = STEPS.NAME;
                delete ctx.session.password;

                await ctx.reply(getText(ctx, 'account_created'));
                break;

            case STEPS.NAME:
                if (await updateProfile(ctx, { full_name: text })) {
                    ctx.session.full_name = text;
                    ctx.session.step = STEPS.JOB_TITLE;
                    await ctx.reply(getText(ctx, 'job_title_prompt'));
                }
                break;

            case STEPS.JOB_TITLE:
                if (await updateProfile(ctx, { job_title: text })) {
                    ctx.session.job_title = text;
                    ctx.session.step = STEPS.PHONE;
                    await ctx.reply(getText(ctx, 'phone_prompt'));
                }
                break;

            case STEPS.PHONE:
                if (await updateProfile(ctx, { phone: text })) {
                    ctx.session.phone = text;
                    ctx.session.step = STEPS.REGION;

                    // Create region buttons based on user's language
                    const lang = ctx.session.lang || 'ru';
                    const regionButtons = [];
                    const regionKeys = Object.keys(regions);

                    // Create rows of 2 buttons each
                    for (let i = 0; i < regionKeys.length; i += 2) {
                        const row = [];
                        row.push(regions[regionKeys[i]][lang]);
                        if (i + 1 < regionKeys.length) {
                            row.push(regions[regionKeys[i + 1]][lang]);
                        }
                        regionButtons.push(row);
                    }

                    await ctx.reply(getText(ctx, 'region_prompt'),
                        Markup.keyboard(regionButtons).oneTime().resize()
                    );
                }
                break;

            case STEPS.REGION:
                // Find the region key by matching the display text
                const lang = ctx.session.lang || 'ru';
                let regionKey = null;

                for (const [key, values] of Object.entries(regions)) {
                    if (values[lang] === text || values.ru === text || values.uz === text) {
                        regionKey = key;
                        break;
                    }
                }

                if (!regionKey) {
                    return ctx.reply(getText(ctx, 'region_prompt') + '\n\n⚠️ Please select from the buttons.');
                }

                if (await updateProfile(ctx, { region: regionKey })) {
                    ctx.session.region = regionKey;  // Store English key
                    ctx.session.city = '';  // City should be empty string per website
                    ctx.session.step = STEPS.LOCATION;
                    await ctx.reply(getText(ctx, 'location_prompt'), Markup.removeKeyboard());
                }
                break;

            case STEPS.LOCATION:
                if (await updateProfile(ctx, { location: text })) {
                    ctx.session.location = text;
                    ctx.session.step = STEPS.BIO;
                    await ctx.reply(getText(ctx, 'bio_prompt'));
                }
                break;

            case STEPS.BIO:
                ctx.session.bio = text;
                ctx.session.step = STEPS.EXPERIENCE;
                await ctx.reply(getText(ctx, 'experience_prompt'));
                break;

            case STEPS.EXPERIENCE:
                ctx.session.years_experience = text;
                ctx.session.step = STEPS.SOCIAL_MEDIA;

                const skipBtn = getText(ctx, 'btn_skip');
                await ctx.reply(getText(ctx, 'social_media_prompt'), Markup.keyboard([[skipBtn]]).oneTime().resize());
                break;

            case STEPS.SOCIAL_MEDIA:
                const skipText = getText(ctx, 'btn_skip');
                if (text !== skipText) {
                    ctx.session.instagram = text; // Storing generic text
                }

                ctx.session.step = STEPS.PROFILE_PIC;
                await ctx.reply(getText(ctx, 'profile_pic_prompt'), Markup.keyboard([[skipText]]).oneTime().resize());
                break;

            case STEPS.PROFILE_PIC:
                const skipTextPic = getText(ctx, 'btn_skip');
                if (text === skipTextPic) {
                    ctx.session.profile_image = null;
                    await finishSignup(ctx);
                } else {
                    await ctx.reply(getText(ctx, 'photo_error'));
                }
                break;

            case STEPS.COMPLETED:
                await ctx.reply(getText(ctx, 'already_set_up'));
                break;
        }

    } catch (err) {
        console.error('Error in text handler:', err);
        ctx.reply('An unexpected error occurred.');
    }
});

// Handle Photos and Documents (for uncompressed images)
bot.on(['photo', 'document'], async (ctx) => {
    if (ctx.session && ctx.session.step === STEPS.PROFILE_PIC) {
        let fileId;

        if (ctx.message.photo) {
            // Get the largest photo
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            fileId = photo.file_id;
        } else if (ctx.message.document) {
            // Check if it's an image
            const mime = ctx.message.document.mime_type;
            if (!mime || !mime.startsWith('image/')) {
                return ctx.reply(getText(ctx, 'photo_error'));
            }
            fileId = ctx.message.document.file_id;
        }

        if (!fileId) return;

        await ctx.reply(getText(ctx, 'uploading_photo'));

        try {
            // Get download link from Telegram
            const fileLink = await ctx.telegram.getFileLink(fileId);

            // Attempt to upload to Supabase Storage 'avatars'
            const response = await fetch(fileLink);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const fileName = `${ctx.from.id}_${Date.now()}.jpg`;
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('avatars')
                .upload(fileName, buffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) {
                console.error('❌ Storage Upload Error Details:');
                console.error('  Error Message:', uploadError.message);
                console.error('  Error Status:', uploadError.status || uploadError.statusCode);
                console.error('  Error Code:', uploadError.code);
                console.error('  Full Error:', JSON.stringify(uploadError, null, 2));
                console.error('  File Name:', fileName);
                console.error('  Buffer Size:', buffer.length, 'bytes');
                // Fallback
                ctx.session.profile_image = fileId;
                await ctx.reply(getText(ctx, 'photo_saved_bot'));
            } else {
                const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
                ctx.session.profile_image = publicUrl;
                console.log('✅ Image uploaded to:', publicUrl);
                // await ctx.reply(getText(ctx, 'upload_success', { url: publicUrl })); // Optional
            }

        } catch (e) {
            console.error('Image processing error:', e);
            ctx.session.profile_image = fileId; // Fallback
        }

        await finishSignup(ctx);
    }
});

async function finishSignup(ctx) {
    await ctx.reply(getText(ctx, 'saving_profile'));
    const jobSeeker = await saveJobSeeker(ctx);
    ctx.session.step = STEPS.COMPLETED;

    // Use the job seeker ID (PK) for the public link, fallback to userId only if necessary
    const linkId = jobSeeker?.id || ctx.session.userId;

    await ctx.reply(getText(ctx, 'profile_completed', { id: linkId }), Markup.removeKeyboard());
}

bot.launch().then(() => {
    console.log('✅ Bot started');
}).catch(err => {
    console.error('Failed to start bot', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
