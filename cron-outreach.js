// ============================================================================
// LYNELOCALIZE B2B OUTREACH AGENT - VERCEL CRON + CLAUDE + SENDGRID + SUPABASE
// ============================================================================
// Déploie ça sur Vercel. Cron se déclenche tous les lundi 9h CET via /api/cron-outreach
// ============================================================================

// 1. INSTALL DEPENDENCIES
// npm install node-fetch @supabase/supabase-js dotenv @sendgrid/mail @anthropic-ai/sdk

// 2. ENV VARIABLES (dans .env.local ou Vercel dashboard)
// SUPABASE_URL=https://xxxxx.supabase.co
// SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
// SENDGRID_API_KEY=SG.xxxxx
// ANTHROPIC_API_KEY=sk-ant-xxxxx
// SENDER_EMAIL=toi@lynelocalize.de

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const Anthropic = require("@anthropic-ai/sdk");
const sgMail = require("@sendgrid/mail");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Initialize Supabase client
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

    // Query: fetch all contacts where next_followup_date <= today
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
// STEP 2: RESEARCH AGENT (light context about company)
// ============================================================================
async function researchCompany(companyName) {
  // Pour cette démo, on va simuler. En prod, tu appellerais Apify ou Cheerio
  return `${companyName} est une entreprise MedTech. Je n'ai pas de context supplémentaire pour cette relance.`;
}

// ============================================================================
// STEP 3: EMAIL GENERATION AGENT (Claude API)
// ============================================================================
async function generatePersonalizedEmail(contact, articleContext) {
  const prompt = `Tu es un expert en outreach B2B pour une consultante en localisation MedTech.

Contexte du contact:
- Nom: ${contact.name}
- Entreprise: ${contact.company}
- Secteur: ${contact.sector}
- Context: ${articleContext}

Article à mentionner:
- Type: ${contact.articleToSend}
- Si c'est "mdr-5-risks", parle des 5 risques quand une boîte MedTech entre en France
- Si c'est "medical-software-localization", parle de l'importance de la localisation du software médical
- Si c'est "compliance", parle de la conformité MDR en France

Génère un email court (200 mots max) qui:
1. Mention un détail récent/spécifique du contact (basé sur le context)
2. Explique brièvement pourquoi c'est pertinent pour eux
3. Link subtil vers l'article (jamais "clique ici", plutôt "j'ai écrit quelque chose sur ce sujet")
4. Termine par un CTA soft ("Si ça vous intéresse, je suis dispo pour un café virtuel")
5. Ton: français professionnel, jamais pushy, humain

Réponds UNIQUEMENT avec le contenu de l'email (sans sujet, sans formatage, juste le body).`;

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

    const emailBody =
      message.content[0].type === "text" ? message.content[0].text : "";
    return emailBody;
  } catch (error) {
    console.error("[CLAUDE ERROR]", error);
    return null;
  }
}

// ============================================================================
// STEP 4: EMAIL SUBJECT GENERATION (Claude)
// ============================================================================
async function generateEmailSubject(contact) {
  const prompt = `Génère un subject line court (5-8 mots) pour un email de outreach vers ${contact.name} (${contact.company}).
Ton: professionnel mais personnel, jamais spammy.
Basé sur: ils travaillent en MedTech et on veut les inviter à lire un article sur les risques/localisation.
Réponds UNIQUEMENT avec le subject (sans guillemets, sans formatage).`;

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
      : "Localisation MedTech en France";
  } catch (error) {
    console.error("[SUBJECT GENERATION ERROR]", error);
    return "Localisation MedTech en France";
  }
}

// ============================================================================
// STEP 5: SEND EMAIL VIA SENDGRID
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
    customArgs: {
      contact_id: contact.id.toString(),
      contact_name: contact.name,
      company: contact.company,
    },
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
// STEP 6: UPDATE SUPABASE RECORD
// ============================================================================
async function updateSupabaseRecord(contactId, emailSentSuccessfully) {
  const now = new Date().toISOString().split("T")[0];
  const nextFollowupDate = new Date();
  nextFollowupDate.setDate(nextFollowupDate.getDate() + 7); // Relance dans 7 jours
  const nextFollowupStr = nextFollowupDate.toISOString().split("T")[0];

  try {
    const { error } = await supabase
      .from("contacts")
      .update({
        last_contact: now,
        next_followup_date: nextFollowupStr,
        response_status: "sent",
      })
      .eq("id", contactId);

    if (error) {
      console.error("[SUPABASE UPDATE ERROR]", error);
    } else {
      console.log(`[SUPABASE] Contact ${contactId} mis à jour`);
    }
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
    console.log("[INFO] Aucun contact à relancer aujourd'hui");
    return { success: true, message: "No contacts to process" };
  }

  let successCount = 0;

  for (const contact of contacts) {
    console.log(`\n[PROCESSING] ${contact.name} (${contact.company})`);

    // Step 1: Research context
    const context = await researchCompany(contact.company);

    // Step 2: Generate email body
    const emailBody = await generatePersonalizedEmail(contact, context);
    if (!emailBody) {
      console.log(`[SKIP] Impossible de générer l'email pour ${contact.email}`);
      continue;
    }

    // Step 3: Generate subject
    const subject = await generateEmailSubject(contact);

    // Step 4: Send email
    const sent = await sendEmail(contact, subject, emailBody);
    if (sent) {
      // Step 5: Update Supabase
      await updateSupabaseRecord(contact.id, true);
      successCount++;
    }

    // Anti-rate-limit: wait 2 seconds between emails
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`\n[COMPLETE] ${successCount}/${contacts.length} emails envoyés`);
  return { success: true, sent: successCount, total: contacts.length };
}

// ============================================================================
// VERCEL CRON HANDLER
// ============================================================================
export default async function handler(req, res) {
  // Sécurité : vérifier que c'est un appel autorisé (optionnel mais recommandé)
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

// ============================================================================
// ALTERNATIVE: Local testing
// ============================================================================
// Pour tester en local avant de déployer :
// node lynelocalize-agent-supabase.js
if (require.main === module) {
  orchestrateOutreach().catch(console.error);
}
