-- ============================================
-- ShoreStack Vault — Migration: Add file_name_iv column
-- ============================================
-- Required for Fix 1.1: Document filename IV was not being stored separately.
-- The file_iv column holds the IV for the file body; the filename needs its own IV.
-- Run this BEFORE deploying the updated DocumentUpload.tsx.

ALTER TABLE vault_documents
ADD COLUMN IF NOT EXISTS file_name_iv TEXT;

-- For existing documents uploaded before this fix, file_name_iv will be NULL.
-- The app code falls back to file_iv for legacy docs (which may not decrypt correctly
-- since the IVs were mismatched — those documents may need re-upload).

COMMENT ON COLUMN vault_documents.file_name_iv IS
  'IV used to encrypt file_name_encrypted. Separate from file_iv (which is for the file body).';
