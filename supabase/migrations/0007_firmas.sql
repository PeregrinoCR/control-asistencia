-- Firma dibujada en las salidas anticipadas: la imagen de la firma (PNG en data URL).
-- Las giras ya tienen la columna gira_autorizaciones.firma. Se puede correr más de una vez.
alter table salidas add column if not exists firma text;
