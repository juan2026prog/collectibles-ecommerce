export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY is not configured",
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-terra",
        input: "Respond only with: OPENAI_COLLECTIBLES_OK",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data,
      });
    }

    return res.status(200).json({
      ok: true,
      response: data.output_text,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}