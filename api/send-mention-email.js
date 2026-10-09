import nodemailer from "nodemailer";

const ALLOWED_DOMAIN = "@mylav.net";
const APP_URL = "https://registro-consegne.vercel.app";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Metodo non consentito" });
  }

  const { to, toName, operator, text, reparto, category, kind } = req.body || {};
  if (!to || !operator || !text) {
    return res.status(400).json({ ok: false, error: "Dati mancanti nella richiesta" });
  }

  const recipient = String(to).trim().toLowerCase();
  if (!recipient.endsWith(ALLOWED_DOMAIN)) {
    return res.status(400).json({ ok: false, error: "Destinatario non consentito" });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return res.status(500).json({ ok: false, error: "Configurazione email mancante sul server (variabili d'ambiente)" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    const where = kind === "risposta" ? "una risposta" : "una nota";
    const greeting = toName ? `Ciao ${toName},` : "Ciao,";

    const lines = [
      greeting,
      "",
      `${operator} ti ha menzionato in ${where} del Registro Consegne.`,
      "",
      `Settore: ${reparto || "-"}`,
      `Categoria: ${category || "-"}`,
      "",
      `"${text}"`,
      "",
      `Apri il Registro per rispondere: ${APP_URL}`,
      "",
      "— Comunicazione Interna, Laboratorio di Patologia Clinica",
    ];

    await transporter.sendMail({
      from: `"Comunicazione Interna - Patologia Clinica" <${user}>`,
      to: recipient,
      subject: `Menzione nel Registro Consegne - ${operator}`,
      text: lines.join("\n"),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Errore invio email menzione:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
