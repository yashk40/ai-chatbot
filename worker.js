export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS headers applied to every response
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    // Handle CORS preflight (OPTIONS) for any route
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET / — Health check
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        JSON.stringify({ status: "ok", service: "ai-chatbot" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /chat — Chat endpoint
    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const { message, history = [] } = body;

        if (!message || typeof message !== "string") {
          return new Response(
            JSON.stringify({ error: "Missing or invalid 'message' field" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Build the messages array from optional history + new user message
        const messages = [];

        // Validate and append history if present
        if (Array.isArray(history)) {
          for (const entry of history) {
            if (entry && entry.role && entry.content) {
              messages.push({
                role: entry.role === "assistant" ? "assistant" : "user",
                content: String(entry.content),
              });
            }
          }
        }

        // Append the current user message
        messages.push({ role: "user", content: message });

        // Run the model using the native env.AI binding
        // Using Llama 3.1 8B Instruct — a suitable general-purpose chat model
        const aiResponse = await env.AI.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          { messages }
        );

        // Extract the response text
        const reply =
          aiResponse?.response ??
          aiResponse?.result?.response ??
          "I couldn't generate a response.";

        return new Response(
          JSON.stringify({ response: reply }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Failed to process chat request", detail: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fallback: 404 for unknown routes
    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  },
};