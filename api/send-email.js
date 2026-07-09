import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Metodo non consentito" });
  }

  const { text, reparto, category, operator } = req.body || {};
  if (!text || !operator) {
    return res.status(400).json({ ok: false, error: "Dati mancanti nella richiesta" });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.CC_DESTINATION_EMAIL;

  if (!user || !pass || !to) {
    return res.status(500).json({ ok: false, error: "Configurazione email mancante sul server (variabili d'ambiente)" });
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
      subject: `Comunicazione Customer Care - ${reparto || "Laboratorio"}`,
      text: `Settore: ${reparto || "-"}\nCategoria: ${category || "-"}\n\n${text}\n\n— ${operator}, Laboratorio di Patologia Clinica`,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Errore invio email:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
