const sgMail = require("@sendgrid/mail");
const { createClient } = require("@supabase/supabase-js");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function getLastName(fullName) {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1];
}

function getSalutation(fullName) {
  const femaleNames = ["Eda", "Ramona", "Stefanie"];
  const firstName = fullName.trim().split(" ")[0];
  if (femaleNames.includes(firstName)) {
    return "Frau";
  }
  return "Herr";
}

function getArticleLink(articleType) {
  const links = {
    "mdr-5-risks": "https://lynelocalize.de/de/article-2-5-risiken-beim-eintritt",
    "medical-software-localization": "https://lynelocalize.de/de/article-1-medizinische-software-lokalisierung",
    "compliance": "https://lynelocalize.de/de/article-3-mdr-und-lokalisierung"
  };
  return links[articleType] || "https://lynelocalize.de";
}

// EMAIL 1: INTRODUCTION (Relance 0)
function generateEmailBody1(contact, articleType) {
  const lastName = getLastName(contact.name);
  const salutation = `${getSalutation(contact.name)} ${lastName}`;
  const articleLink = getArticleLink(articleType);

  const templates = {
    "mdr-5-risks": `Hallo ${salutation},

ich habe beobachtet, dass ${contact.company} aktiv auf dem französischen Markt wächst. Ein Markteintritt in Frankreich mit einer eigenen Filiale ist eine ausgezeichnete Entscheidung, führt aber auch oft zu regulatorischen Herausforderungen.

Ich habe einen Artikel über die 5 häufigsten Fehler geschrieben, die deutsche MedTech-Unternehmen beim Eintritt in Frankreich machen. Basierend auf 10 Jahren Erfahrung.

Falls interessant, bin ich gerne verfügbar für ein Gespräch.

Lesen Sie den vollständigen Artikel hier: ${articleLink}

Viele Grüße,
Christelle Datouo
LyneLocalize`,

    "medical-software-localization": `Hallo ${salutation},

Sie haben kritische Software-Tools für medizinische Anwendungen. Eine Lokalisierung ins Französische ist nicht nur Übersetzung, sondern erfordert Anpassung von Compliance, UX und lokaler Regulierung.

Ich habe einen Artikel geschrieben, warum Software-Lokalisierung für medizinische Geräte anders sein muss. Das deckt exakt ab, was Sie bei ${contact.company} jetzt durchlaufen.

Falls Sie daran interessiert sind, können Sie mich gerne kontaktieren.

Lesen Sie den vollständigen Artikel hier: ${articleLink}

Viele Grüße,
Christelle Datouo
LyneLocalize`,

    "compliance": `Hallo ${salutation},

MDR-Konformität in Frankreich ist nicht nur administrativ – es ist Ihr Markteintritts-Ticket. Ich habe viele Unternehmen wie ${contact.company} gesehen, die 6 Monate bei der Dokumentation verlieren.

Ich habe diesen Prozess für mehrere Unternehmen Ihrer Kategorie implementiert. Ich kenne die Best Practices und was zu viel kostet.

Falls Sie interessiert sind, wie Sie das beschleunigen können, helfe ich gerne.

Lesen Sie den vollständigen Artikel hier: ${articleLink}

Viele Grüße,
Christelle Datouo
LyneLocalize`,
  };

  return templates[articleType] || templates["mdr-5-risks"];
}

// EMAIL 2: FOLLOW-UP RELEVANCE (Relance 1)
function generateEmailBody2(contact, articleType) {
  const lastName = getLastName(contact.name);
  const salutation = `${getSalutation(contact.name)} ${lastName}`;
  const articleLink = getArticleLink(articleType);

  const templates = {
    "mdr-5-risks": `Hallo ${salutation},

ich bin zurück – nicht weil ich nervös bin, sondern weil ich regelmäßig sehe, dass deutsche MedTech-Firmen Wochen (und tausende Euro) bei der Frankreich-Expansion verschwenden.

Die Fehler, die ich dokumentiert habe, kosten durchschnittlich:
- 8 Wochen Verzögerung
- €15-30K Beratungskosten
- Regulatorische Risiken, die später teuer werden

Haben Sie den Artikel gelesen? Falls ja und Sie interessiert sind – rufen Sie mich an. Falls nein – hier ist der Link nochmal: ${articleLink}

Ich bin diese Woche verfügbar.

Viele Grüße,
Christelle Datouo
LyneLocalize`,

    "medical-software-localization": `Hallo ${salutation},

kleine Frage: Haben Sie den Artikel zur Software-Lokalisierung gelesen?

Der Grund ich frage: Viele Firmen unterschätzen, dass französische Regulierung für Medical Software ANDERS ist als die deutschen Standards. Das kostet später Zeit und Kosten.

Meine Empfehlung: Lesen Sie den Artikel und sagen Sie mir, ob das für Sie relevant ist: ${articleLink}

Falls ja – können wir einen kurzen Call vereinbaren (15 Min). Falls nein – verstanden.

Christelle Datouo
LyneLocalize`,

    "compliance": `Hallo ${salutation},

schnelle Frage: Wie weit seid ihr bei MDR-Konformität für Frankreich?

Der Grund ich frage: Viele Firmen warten bis zum letzten Moment, dann gibt es Überraschungen.

Ich habe eine Checkliste dokumentiert, die euch 6-8 Wochen sparen kann: ${articleLink}

Worth a look?

Christelle
LyneLocalize`,
  };

  return templates[articleType] || templates["mdr-5-risks"];
}

// EMAIL 3: LAST CHANCE (Relance 2)
function generateEmailBody3(contact, articleType) {
  const lastName = getLastName(contact.name);
  const salutation = `${getSalutation(contact.name)} ${lastName}`;

  const templates = {
    "mdr-5-risks": `Hallo ${salutation},

letzte Nachricht von mir.

Ich sehe, dass Sie nicht geantwortet haben. Entweder:
1. Nicht interessiert (verstanden, kein Problem)
2. Zu beschäftigt (ich verstehe es, macht passiert)
3. Nicht das Richtige für Sie

Falls (2) oder (3): Ich bin diese Woche frei für einen kurzen Call. Keine Verkaufsmasche – nur 15 Minuten, um zu sehen, ob wir zusammenpassen.

Zeitslots: Montag-Freitag, 14-16 Uhr CEST
Kalender: https://lynelocalize.de

Falls Ihr Timing kompliziert ist: kontaktieren Sie mich direkt.

Sonst viel Erfolg bei der Frankreich-Expansion!

Christelle
LyneLocalize`,

    "medical-software-localization": `Hallo ${salutation},

das ist meine letzte Nachricht.

Falls Sie Interesse an Software-Lokalisierung für Frankreich haben: Hier sind meine freien Slots diese Woche.

Falls nicht: Alles klar, viel Erfolg!

https://lynelocalize.de

Christelle`,

    "compliance": `Hallo ${salutation},

last attempt.

Wenn MDR-Compliance auf Ihrer Prioritätenliste steht – ich kann helfen. Wenn nicht – alles Gute!

Christelle
LyneLocalize`,
  };

  return templates[articleType] || templates["mdr-5-risks"];
}

// Select the right template based on relance_count
function generateEmailBody(contact, articleType, relanceCount) {
  if (relanceCount === 0) {
    return generateEmailBody1(contact, articleType);
  } else if (relanceCount === 1) {
    return generateEmailBody2(contact, articleType);
  } else {
    return generateEmailBody3(contact, articleType);
  }
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
      relanceCount: record.relance_count || 0,
    }));

    console.log(`[SUPABASE] ${contacts.length} contacts à relancer`);
    return contacts;
  } catch (error) {
    console.error("[SUPABASE QUERY ERROR]", error);
    return [];
  }
}

function generateEmailSubject(contact, relanceCount) {
  if (relanceCount === 0) {
    // First email: introduction
    const subjects = [
      `Markteintritt Frankreich: Regulatorische Sicherheit für ${contact.company}`,
      `Schnelle Frage zu Ihrer Frankreich-Strategie`,
      `MDR-Compliance in Frankreich: Was Sie wissen sollten`,
    ];
    return subjects[contact.id % subjects.length];
  } else if (relanceCount === 1) {
    // Second email: follow-up
    return `[Folgefrage] Frankreich-Expansion für ${contact.company}`;
  } else {
    // Third email: last chance
    return `Letzte Gelegenheit: ${contact.company} + Frankreich`;
  }
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

async function updateSupabaseRecord(contactId, relanceCount) {
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
        relance_count: relanceCount + 1,
      })
      .eq("id", contactId);

    console.log(`[SUPABASE] Contact ${contactId} aktualisiert (relance_count: ${relanceCount + 1})`);
  } catch (error) {
    console.error("[SUPABASE UPDATE ERROR]", error);
  }
}

async function orchestrateOutreach() {
  console.log("[START] LyneLocalize B2B Outreach Agent (3-EMAIL SEQUENCE)");

  const contacts = await getContactsToRelance();
  if (contacts.length === 0) {
    console.log("[INFO] Keine Kontakte zum Nachverfolgen");
    return { success: true, message: "No contacts to process" };
  }

  let successCount = 0;

  for (const contact of contacts) {
    console.log(`[PROCESSING] ${contact.name} (${contact.company}) - Relance #${contact.relanceCount}`);

    const emailBody = generateEmailBody(contact, contact.articleToSend, contact.relanceCount);
    const subject = generateEmailSubject(contact, contact.relanceCount);
    const sent = await sendEmail(contact, subject, emailBody);

    if (sent) {
      await updateSupabaseRecord(contact.id, contact.relanceCount);
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
