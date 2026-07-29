-- Encrypt date of birth and residential-address details as one protected payload.
-- Existing plaintext columns remain for backward-compatible schema evolution but
-- version 8 writes NULL to them and does not expose them through admin APIs.
ALTER TABLE sensitive_identity ADD COLUMN identity_ciphertext TEXT;
ALTER TABLE sensitive_identity ADD COLUMN identity_iv TEXT;
ALTER TABLE sensitive_identity ADD COLUMN identity_algorithm TEXT;
