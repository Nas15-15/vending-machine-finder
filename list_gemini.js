import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  const json = await res.json();
  console.log(json.models?.map(m => m.name).join('\n') || json);
}
listModels();
