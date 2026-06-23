-- Prevent concurrent duplicate web-chat submissions with the same clientSubmissionId
-- from both passing the application-level check-then-insert and creating two orders.
-- The partial unique index (non-null clientSubmissionId) lets us rely on
-- ON CONFLICT DO NOTHING at the DB layer as a backstop.
CREATE UNIQUE INDEX conversation_messages_client_submission_id_idx
    ON conversation_messages (conversation_id, (metadata->>'clientSubmissionId'))
    WHERE metadata->>'clientSubmissionId' IS NOT NULL;
