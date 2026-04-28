-- 1. Crear el esquema si no existe
CREATE SCHEMA IF NOT EXISTS ingresos_egresos;

-- 2. Eliminar lo anterior si existiese
DROP TABLE IF EXISTS ingresos_egresos.movimientos;
DROP TABLE IF EXISTS ingresos_egresos.perfiles;

-- 3. Crear tabla Perfiles en el nuevo esquema
CREATE TABLE ingresos_egresos.perfiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  rol text NOT NULL DEFAULT 'student' CHECK (rol IN ('student', 'preceptor', 'admin')),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ingresos_egresos.perfiles ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad para Perfiles
CREATE POLICY "Permitir leer perfiles" ON ingresos_egresos.perfiles
  FOR SELECT USING (
    auth.uid() = id OR 
    (SELECT rol FROM ingresos_egresos.perfiles WHERE id = auth.uid()) IN ('preceptor', 'admin')
  );


-- 4. Función y Trigger (Default: student)
CREATE OR REPLACE FUNCTION ingresos_egresos.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO ingresos_egresos.perfiles (id, email, rol)
  VALUES (new.id, new.email, 'student');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE ingresos_egresos.handle_new_user();


-- 5. Tabla Movimientos
CREATE TABLE ingresos_egresos.movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES ingresos_egresos.perfiles(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora_salida time NOT NULL,
  firma_salida text NOT NULL,
  hora_ingreso time, 
  firma_ingreso text, 
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ingresos_egresos.movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student inserta su salida" ON ingresos_egresos.movimientos
  FOR INSERT WITH CHECK (auth.uid() = perfil_id);

CREATE POLICY "Lectura de movimientos" ON ingresos_egresos.movimientos
  FOR SELECT USING (true);

CREATE POLICY "Student confirma su ingreso" ON ingresos_egresos.movimientos
  FOR UPDATE USING (auth.uid() = perfil_id);
