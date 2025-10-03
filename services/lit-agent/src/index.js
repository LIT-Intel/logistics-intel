import express from "express";
import {v4 as uuidv4} from "uuid";
import {insert, nowTs} from "./bq.js";
import {generatePlan} from "./vertex.js";

const app = express();
app.use(express.json({limit:"1mb"}));

app.get("/healthz", (_req, res) => {
  res.json({ok:true, service:"lit-agent", ts:new Date().toISOString()});
});

app.post("/agent/chat", async (req, res) => {
  try {
    const {message, context={}, preferences={}} = req.body || {};
    const sessionId = uuidv4();
    const created_at = await nowTs();

    // Log session + user message
    await insert("agent_sessions", {
      id: sessionId,
      user_id: "system",  // replace if you have auth
      created_at,
      status: "open",
      context: JSON.stringify(context)
    });
    await insert("agent_messages", {
      id: uuidv4(),
      session_id: sessionId,
      role: "user",
      content: JSON.stringify({message, context, preferences}),
      created_at
    });

    // Call Vertex to get a Plan JSON
    const plan = await generatePlan({message, context, preferences});

    // Log plan
    await insert("agent_plans", {
      id: uuidv4(),
      session_id: sessionId,
      summary: plan?.plan?.summary || "",
      files_to_touch: JSON.stringify(plan?.plan?.files_to_touch || []),
      checks: JSON.stringify(plan?.plan?.checks || []),
      feature_flags: JSON.stringify(plan?.plan?.feature_flags || []),
      est_changes: JSON.stringify(plan?.plan?.est_changes || {}),
      risk_level: plan?.plan?.risk_level || "low",
      created_at
    });

    res.json({session_id: sessionId, ...plan});
  } catch (e) {
    console.error(e);
    res.status(500).json({ok:false, error:String(e)});
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`lit-agent listening on :${port}`));