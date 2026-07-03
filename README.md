# Registro Consegne e Comunicazioni Interne — guida alla pubblicazione

Questa guida presuppone che tu non abbia mai pubblicato un sito prima. Segui i passaggi in ordine, senza saltarne nessuno. Tempo previsto: 20-30 minuti la prima volta.

Userai tre servizi, tutti gratuiti nel piano base:

- **Supabase** → il database condiviso (dove vivono le voci, le firme, le risposte)
- **GitHub** → dove carichi il codice
- **Vercel** → pubblica il sito online e lo aggiorna automaticamente

---

## Passo 1 — Crea il database su Supabase

1. Vai su **supabase.com** e crea un account gratuito (puoi usare "Continue with GitHub" se hai già un account GitHub, altrimenti registrati con l'email).
2. Clicca **New project**. Dai un nome (es. "registro-consegne"), scegli una password per il database (salvala da qualche parte, non ti servirà quasi mai) e una regione vicina (es. Europe).
3. Aspetta 1-2 minuti che il progetto venga creato.
4. Nel menu a sinistra, apri **SQL Editor**.
5. Apri il file **`supabase-schema.sql`** incluso in questo pacchetto, copia tutto il contenuto, incollalo nell'SQL Editor e clicca **Run**. Questo crea le due tabelle (`entries` e `briefings`) e attiva la sincronizzazione in tempo reale.
6. Nel menu a sinistra vai su **Project Settings → API**. Ti servono due valori, tienili a portata di mano per il Passo 3:
   - **Project URL** (es. `https://xxxxx.supabase.co`)
   - **anon public key** (una stringa lunga)

---

## Passo 2 — Carica il codice su GitHub

1. Vai su **github.com** e crea un account gratuito se non ce l'hai già.
2. Clicca il **+** in alto a destra → **New repository**. Dai un nome (es. `registro-consegne`), lascialo **Public** o **Private** (indifferente), NON aggiungere README, poi **Create repository**.
3. Nella pagina del repository appena creato, clicca **uploading an existing file**.
4. Trascina dentro tutti i file e le cartelle di questo pacchetto (compresa la cartella `src`).
5. Scorri in basso e clicca **Commit changes**.

---

## Passo 3 — Pubblica con Vercel

1. Vai su **vercel.com** e crea un account gratuito usando **Continue with GitHub** (così si collega automaticamente).
2. Clicca **Add New → Project**.
3. Trova il repository `registro-consegne` che hai appena caricato e clicca **Import**.
4. Prima di cliccare Deploy, apri la sezione **Environment Variables** e aggiungi questi due valori (quelli del Passo 1):
   - `VITE_SUPABASE_URL` → il Project URL di Supabase
   - `VITE_SUPABASE_ANON_KEY` → l'anon public key di Supabase
5. Clicca **Deploy**. Dopo circa un minuto, Vercel ti dà un indirizzo tipo `registro-consegne.vercel.app` — è il link da condividere con i 18 operatori.

Da questo momento, ogni volta che vorrai modificare qualcosa nel codice, basterà caricare il file aggiornato su GitHub: Vercel lo pubblica da solo in automatico.

---

## Cosa sapere prima di usarlo con tutto il reparto

- **Non c'è una vera password.** Chiunque abbia il link può entrare e scrivere il proprio nome, esattamente come nell'anteprima che hai provato. Va bene per un test interno; se vuoi che sia ad accesso riservato, il passaggio successivo è aggiungere un'autenticazione vera (posso occuparmene quando siete pronti).
- **La sincronizzazione è davvero istantanea**, a differenza dell'anteprima: chi scrive una voce o risponde a una nota, la vedono comparire agli altri nel giro di un istante, senza dover ricaricare la pagina.
- Se qualcosa non torna dopo il deploy (schermata bianca, errore), il 90% delle volte è perché le due variabili del Passo 3.4 sono state scritte in modo diverso da come compaiono su Supabase — vale la pena ricontrollarle per prime.
