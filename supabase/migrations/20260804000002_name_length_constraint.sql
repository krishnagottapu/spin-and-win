-- Add CHECK constraint to enforce 100-character limit on participant names
ALTER TABLE participants ADD CONSTRAINT participants_name_length CHECK (char_length(name) <= 100);
