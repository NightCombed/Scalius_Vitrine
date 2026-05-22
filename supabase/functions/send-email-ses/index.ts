import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AwsClient } from "npm:aws4fetch@1.0.19";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string | string[];
  fromName?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: SendEmailPayload = await req.json();
    const { to, subject, html, replyTo, fromName } = payload;

    if (!to || !subject || !html) {
      throw new Error("Missing required fields: to, subject, html");
    }

    const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const region = Deno.env.get("AWS_REGION") || "us-east-1";
    const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "notificacoes@scalius.com.br";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("Missing AWS credentials in environment");
    }

    // Build the request body for SES API v2
    const toAddresses = Array.isArray(to) ? to : [to];
    const replyToAddresses = replyTo
      ? Array.isArray(replyTo)
        ? replyTo
        : [replyTo]
      : undefined;

    const source = "Scalius <notificacoes@scalius.com.br>";
    console.log(`Sending email using hardcoded source: "${source}"`);

    const requestBody = {
      FromEmailAddress: source,
      Destination: {
        ToAddresses: toAddresses,
      },
      ReplyToAddresses: replyToAddresses,
      Content: {
        Simple: {
          Subject: {
            Data: subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: html,
              Charset: "UTF-8",
            },
          },
        },
      },
    };

    const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;

    // Instantiate AwsClient
    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region,
      service: "ses",
    });

    // Send the request via AwsClient
    const response = await aws.fetch(url, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("SES Error:", responseText);
      throw new Error(`SES Error: ${response.status} - ${responseText}`);
    }

    const result = JSON.parse(responseText);

    return new Response(JSON.stringify({ success: true, messageId: result.MessageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
