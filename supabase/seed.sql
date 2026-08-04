-- Local development admin user (password: admin123)
INSERT INTO admins (id, username, password_hash)
VALUES (
  gen_random_uuid(),
  'admin',
  '$2a$10$IsgAIt2yNV/IdNJnue3dauX7JaOwfjSqtD48VB2Ogj3kxecA9QsVe'
);
