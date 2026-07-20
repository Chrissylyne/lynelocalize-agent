const sgMail = require("@sendgrid/mail");
const { createClient } = require("@supabase/supabase-js");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Extract last name from full name
function getLastName(fullName) {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1];
}

// Detect salutation (Herr/Frau) - basic gender detection
function getSalutation(fullName) {
  // Frauennamen detection (simplified)
  const femaleNames = ["Eda", "Ramona", "Stefanie"];
  const firstName = fullName.trim().split(" ")[0];
  if (femaleNames.includes(firstName)) {
    return "Frau";
  }
  return "Herr";
}

// TEST MODE: Deutschsprachige Templates (personalisiert mit Namen)
function generateEmailBody(contact, articleType) {
  const lastName = getLastName(contact.name);
  const salutation = getSalutation(contact.name);
  const greeting = `${salutation} ${lastName}`;

  const templates = {
    "mdr-5-risks": `Hallo ${greeting},

ich habe beobachtet, dass ${contact.company} aktiv auf dem französischen Markt wächst. Ein Markteintritt in Frankreich mit einer eigenen Filiale ist eine ausgezeichnete Entscheidung, führt aber auch oft zu regulatorischen Herausforderungen.

Ich habe einen Artikel über die 5 häufigsten Fehler geschrieben, die deutsche MedTech-Unternehmen beim Eintritt in Frankreich machen. Basierend auf 10 Jahren Erfahrung.

Falls interessant, bin ich gerne verfügbar für ein Gespräch.

Viele Grüße,
Christelle Datouo
LyneLocalize`,

    "medical-software-localization": `Hallo ${greeting},

Sie haben kritische Software-Tools für medizinische Anwendungen. Eine Lokalisierung ins Französische ist nicht nur Übersetzung, sondern erfordert Anpassung von Compliance, UX und lokaler Regulierung.

Ich habe einen Artikel geschrieben, warum Software-Lokalisierung für medizinische Geräte anders sein muss. Das deckt exakt ab, was Sie bei ${contact.company} jetzt durchlaufen.

Falls Sie daran interessiert sind, können Sie mich gerne kontaktieren.

Viele Grüße,
Christelle Datouo
LyneLocalize`,

    "compliance": `Hallo ${greeting},

MDR-Konformität in Frankreich ist nicht nur administrativ – es ist Ihr Markteintritts-Ticket. Ich habe viele Unternehmen wie ${contact.company} gesehen, die 6 Monate bei der Dokumentation verlieren.

Ich habe diesen Prozess für mehrere Unternehmen Ihrer Kategorie implementiert. Ich kenne die Best Practices und was zu viel kostet.

Falls Sie interessiert sind, wie Sie das beschleunigen können, helfe ich gerne.

Viele Grüße,
Christelle Datouo
LyneLocalize`,
  };

  return templates[articleType] || templates["mdr-5-risks"];
}

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
      company: record.company || "Unternehmen",
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

function generateEmailSubject(contact) {
  const subjects = [
    `Markteintritt Frankreich: Regulatorische Sicherheit für ${contact.company}`,
    `Schnelle Frage zu Ihrer Frankreich-Strategie`,
    `MDR-Compliance in Frankreich: Was Sie wissen sollten`,
  ];
  return subjects[contact.id % subjects.length];
}

async function sendEmail(contact, subject, body) {
  const msg = {
    to: contact.email,
    from: process.env.SENDER_EMAIL || "contact@lynelocalize.de",
    subject: subject,
    html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
  };

  try {
    await sgMail.send(msg);
    console.log(`[SENDGRID] Email gesendet an ${contact.email}`);
    return true;
  } catch (error) {
    console.error(`[SENDGRID ERROR] ${contact.email}:`, error.message);
    return false;
  }
}

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

    console.log(`[SUPABASE] Contact ${contactId} aktualisiert`);
  } catch (error) {
    console.error("[SUPABASE UPDATE ERROR]", error);
  }
}

async function orchestrateOutreach() {
  console.log("[START] LyneLocalize B2B Outreach Agent (TEST MODE)");

  const contacts = await getContactsToRelance();
  if (contacts.length === 0) {
    console.log("[INFO] Keine Kontakte zum Nachverfolgen");
    return { success: true, message: "No contacts to process" };
  }

  let successCount = 0;

  for (const contact of contacts) {
    console.log(`[PROCESSING] ${contact.name} (${contact.company})`);

    const emailBody = generateEmailBody(contact, contact.articleToSend);
    const subject = generateEmailSubject(contact);
    const sent = await sendEmail(contact, subject, emailBody);

    if (sent) {
      await updateSupabaseRecord(contact.id);
      successCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`[COMPLETE] ${successCount}/${contacts.length} emails gesendet`);
  return { success: true, sent: successCount };
}

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
