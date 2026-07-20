// ============================================================================
// LYNELOCALIZE B2B OUTREACH AGENT - VERCEL CRON + CLAUDE + SENDGRID + SUPABASE
// ============================================================================

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const Anthropic = require("@anthropic-ai/sdk");
const sgMail = require("@sendgrid/mail");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// STEP 1: READ CONTACTS FROM SUPABASE
// ============================================================================
async function getContactsToRelance() {
  try {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .lte("next_followup_date", today);

    if (error) {
      console.error("[SUPABASE ERROR]", error);
      return [];
    }

    const contacts = data.map((record) => ({
      id: record.id,
      name: record.name || "Contact",
      email: record.email,
      company: record.company || "Entreprise",
      sector: record.sector || "MedTech",
      lastContact: record.last_contact || "N/A",
      responseStatus: record.response_status || "no_response",
      articleToSend: record.article_to_send || "mdr-5-risks",
    }));

    console.log(`[SUPABASE] ${contacts.length} contacts à relancer`);
    return contacts;
  } catch (error) {
    console.error("[SUPABASE QUERY ERROR]", error);
    return [];
  }
}

// ============================================================================
// STEP 2: EMAIL GENERATION AGENT (Claude API)
// ============================================================================
async function generatePersonalizedEmail(contact) {
  const prompt = `Tu es un expert en outreach B2B pour une consultante en localisation MedTech.

Contact:
- Nom: ${contact.name}
- Entreprise: ${contact.company}
- Secteur: ${contact.sector}
- Article: ${contact.articleToSend}

Génère un email court (150-200 mots) qui:
1. Mentionne spécifiquement le contact et son entreprise
2. Explique pourquoi c'est pertinent pour eux
3. Termine par un CTA soft ("je suis dispo pour discuter")
4. Ton: français professionnel, jamais pushy, humain

Réponds UNIQUEMENT avec le body de l'email.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return message.content[0].type === "text" ? message.content[0].text : null;
  } catch (error) {
    console.error("[CLAUDE ERROR]", error);
    return null;
  }
}

// ============================================================================
// STEP 3: EMAIL SUBJECT GENERATION (Claude)
// ============================================================================
async function generateEmailSubject(contact) {
  const prompt = `Génère un subject line court (5-8 mots) pour un email vers ${contact.name} (${contact.company}).
Ton: professionnel mais personnel.
Réponds UNIQUEMENT avec le subject.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return message.content[0].type === "text"
      ? message.content[0].text.trim()
      : "Localisation MedTech";
  } catch (error) {
    console.error("[SUBJECT ERROR]", error);
    return "Localisation MedTech";
  }
}

// ============================================================================
// STEP 4: SEND EMAIL VIA SENDGRID
// ============================================================================
async function sendEmail(contact, subject, body) {
  const msg = {
    to: contact.email,
    from: process.env.SENDER_EMAIL || "contact@lynelocalize.de",
    subject: subject,
    html: `<p>${body.replace(/\n/g, "<br>")}</p>
           <p>Cordialement,<br>
           Christelle Datouo<br>
           LyneLocalize</p>`,
  };

  try {
    await sgMail.send(msg);
    console.log(`[SENDGRID] Email envoyé à ${contact.email}`);
    return true;
  } catch (error) {
    console.error(`[SENDGRID ERROR] ${contact.email}:`, error.message);
    return false;
  }
}

// ============================================================================
// STEP 5: UPDATE SUPABASE RECORD
// ============================================================================
async function updateSupabaseRecord(contactId) {
  const now = new Date().toISOString().split("T")[0];
  const nextFollowupDate = new Date();
  nextFollowupDate.setDate(nextFollowupDate.getDate() + 7);
  const nextFollowupStr = nextFollowupDate.toISOString().split("T")[0];

  try {
    await supabase
      .from("contacts")
      .update({
        last_contact: now,
        next_followup_date: nextFollowupStr,
        response_status: "sent",
      })
      .eq("id", contactId);

    console.log(`[SUPABASE] Contact ${contactId} mis à jour`);
  } catch (error) {
    console.error("[SUPABASE UPDATE ERROR]", error);
  }
}

// ============================================================================
// ORCHESTRATION PRINCIPALE
// ============================================================================
async function orchestrateOutreach() {
  console.log("[START] LyneLocalize B2B Outreach Agent");

  const contacts = await getContactsToRelance();
  if (contacts.length === 0) {
    console.log("[INFO] Aucun contact à relancer");
    return { success: true, message: "No contacts to process" };
  }

  let successCount = 0;

  for (const contact of contacts) {
    console.log(`[PROCESSING] ${contact.name} (${contact.company})`);

    const emailBody = await generatePersonalizedEmail(contact);
    if (!emailBody) {
      console.log(`[SKIP] ${contact.email}`);
      continue;
    }

    const subject = await generateEmailSubject(contact);
    const sent = await sendEmail(contact, subject, emailBody);

    if (sent) {
      await updateSupabaseRecord(contact.id);
      successCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`[COMPLETE] ${successCount}/${contacts.length} emails envoyés`);
  return { success: true, sent: successCount };
}

// ============================================================================
// VERCEL CRON HANDLER
// ============================================================================
export default async function handler(req, res) {
  const authToken = req.headers["authorization"];
  if (authToken !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await orchestrateOutreach();
    return res.status(200).json(result);
  } catch (error) {
    console.error("[HANDLER ERROR]", error);
    return res.status(500).json({ error: error.message });
  }
}
