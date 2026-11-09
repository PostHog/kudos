-- Fails with SQLSTATE 22P02, and its message quotes the literal.
SELECT 'hedgehug-fixture-literal'::integer;
