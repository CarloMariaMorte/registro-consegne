import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Metodo non consentito" });
  }

  const { operator, sections } = req.body || {};
  if (!operator || !Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ ok: false, error: "Nessun sospeso aperto da segnalare" });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.CC_DESTINATION_EMAIL;

  if (!user || !pass || !to) {
    return res.status(500).json({ ok: false, error: "Configurazione email mancante sul server (variabili d'ambiente)" });
  }

  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  let body = `Report giornaliero - Campioni sospesi non ancora refertati\nData: ${today}\nInviato da: ${operator}\n\n`;
  for (const section of sections) {
    body += `=== ${String(section.reparto).toUpperCase()} ===\n`;
    for (const item of section.items) {
      body += `- ${item.text} (nota di ${item.author}, ore ${item.time})\n`;
    }
    body += `\n`;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Comunicazione Interna - Patologia Clinica" <${user}>`,
      to,
      subject: `Report giornaliero sospesi - ${today}`,
      text: body,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Errore invio report giornaliero:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
