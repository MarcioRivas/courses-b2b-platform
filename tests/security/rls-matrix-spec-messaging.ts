import type { MatrixCase } from "./matrix-runner"

/**
 * Direct messaging: only the two participants (studentA ↔ profA) read the
 * conversation and its messages. Not their org admin, and not the platform
 * admin either (it is not an org member). No write policy at all: writes go
 * through start_conversation / send_message (asserted via the catalog and,
 * for messages, with a real INSERT per role).
 */
export function messagingSpec(): MatrixCase[] {
  return [
    {
      table: "conversations",
      op: "select",
      allow: ["profA", "studentA"],
      target: (fx) => ({ id: fx.conversationA }),
    },
    {
      table: "messages",
      op: "select",
      allow: ["profA", "studentA"],
      target: (fx) => ({ id: fx.messageA }),
    },
    {
      table: "messages",
      op: "insert",
      allow: [],
      payload: (fx, role) => ({ conversation_id: fx.conversationA, sender_id: fx.users[role].id, body: "Sec directo" }),
    },
  ]
}
