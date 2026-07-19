// ============================================================================
// LYNELOCALIZE B2B OUTREACH AGENT - VERCEL CRON + CLAUDE + SENDGRID + AIRTABLE
// ============================================================================
// Déploie ça sur Vercel. Cron se déclenche tous les lundi 9h CET via /api/cron-outreach
// ============================================================================

// 1. INSTALL DEPENDENCIES
// npm install node-fetch airtable dotenv @sendgrid/mail

// 2. ENV VARIABLES (dans .env.local ou Vercel dashboard)
// AIRTABLE_API_KEY=pat_xxxxx
// AIRTABLE_BASE_ID=appXxxxx
// AIRTABLE_TABLE_NAME=Contacts
// SENDGRID_API_KEY=SG.xxxxx
// ANTHROPIC_API_KEY=sk-ant-xxxxx
// SENDER_EMAIL=toi@lynelocalize.de

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const Anthropic = require("@anthropic-ai/sdk");
const sgMail = require("@sendgrid/mail");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ============================================================================
// STEP 1: READ CONTACTS FROM AIRTABLE
// ============================================================================
async function getContactsToRelance() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;
  const apiKey = process.env.AIRTABLE_API_KEY;

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    // Filtre : only contacts where next_followup_date <= today
    const today = new Date().toISOString().split("T")[0];
    const contactsToRelance = data.records
      .filter((record) => {
        const nextFollowup = record.fields.next_followup_date;
        return nextFollowup && nextFollowup <= today;
      })
      .map((record) => ({
        id: record.id,
        name: record.fields.name || "Contact",
        email: record.fields.email,
        company: record.fields.company || "Entreprise",
        sector: record.fields.sector || "MedTech",
        lastContact: record.fields.last_contact || "N/A",
        responseStatus: record.fields.response_status || "no_response",
        articleToSend: record.fields.article_to_send || "mdr-5-risks", // Default article key
      }));

    console.log(`[AIRTABLE] ${contactsToRelance.length} contacts à relancer`);
    return contactsToRelance;
  } catch (error) {
    console.error("[AIRTABLE ERROR]", error);
    return [];
  }
}

// ============================================================================
// STEP 2: RESEARCH AGENT (scrape light context about company)
// ============================================================================
async function researchCompany(companyName) {
  // Pour cette démo, on va simuler. En prod, tu appellerais Apify ou Cheerio
  // Ici on utilise Claude pour interpréter une requête web simple
  // (Dans la vraie implémentation, tu ferais un vrai scrape et tu passerais le HTML à Claude)

  // Simulation : contexte simple basé sur le nom
  const contextMap = {
    "Default Company": "Un acteur du secteur MedTech, basé en Allemagne.",
    // Tu peux remplir ça avec des données réelles de tes contacts
  };

  return contextMap[companyName] || `${companyName} est une entreprise MedTech. Je n'ai pas de context supplémentaire.`;
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

    const emailBody = message.content[0].type === "text" ? message.content[0].text : "";
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

    return message.content[0].type === "text" ? message.content[0].text.trim() : "Localisation MedTech en France";
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
      contact_id: contact.id,
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
// STEP 6: UPDATE AIRTABLE (log sent email + next followup)
// ============================================================================
async function updateAirtableRecord(contactId, emailSentSuccessfully) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;
  const apiKey = process.env.AIRTABLE_API_KEY;

  const now = new Date().toISOString().split("T")[0];
  const nextFollowupDate = new Date();
  nextFollowupDate.setDate(nextFollowupDate.getDate() + 7); // Relance dans 7 jours
  const nextFollowupStr = nextFollowupDate.toISOString().split("T")[0];

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}/${contactId}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const fields = {
    last_contact: now,
    next_followup_date: nextFollowupStr,
    response_status: "sent",
  };

  try {
    await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });
    console.log(`[AIRTABLE] Record ${contactId} mis à jour`);
  } catch (error) {
    console.error(`[AIRTABLE UPDATE ERROR]`, error);
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
      // Step 5: Update Airtable
      await updateAirtableRecord(contact.id, true);
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
// node lynelocalize-agent-complete.js
if (require.main === module) {
  orchestrateOutreach().catch(console.error);
}
