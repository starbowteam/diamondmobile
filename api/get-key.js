export default function handler(req, res) {
  // Разрешаем запросы только с твоего домена (важно для безопасности)
  const origin = req.headers.origin;
  const allowedOrigins = ['https://diamondmobile.vercel.app', 'http://localhost:3000'];
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  // Ключ хранится в переменной окружения
  const key = process.env.OPENROUTER_API_KEY;
  
  if (!key) {
    return res.status(500).json({ error: 'Server key not configured' });
  }
  
  res.status(200).json({ key });
}