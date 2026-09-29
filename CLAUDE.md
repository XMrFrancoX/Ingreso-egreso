## Memoria persistente (Cerebrus)
Path: /home/fran/cerebrus

Este proyecto reporta a un wiki central que trackea actividad entre todos los proyectos de Franco.

- Al ARRANCAR una sesión de trabajo importante, si el usuario pregunta "qué hice la semana pasada" o similar, leé primero `cerebrus/wiki/hot.md`, después `cerebrus/wiki/projects/Ingreso-egreso (Escuela).md`.
- Al TERMINAR una sesión de trabajo (o cuando el usuario diga "guardá esto" / "actualizá el wiki"), agregá una entrada arriba de `cerebrus/wiki/log.md` con fecha, qué se hizo y por qué, actualizá `cerebrus/wiki/projects/Ingreso-egreso (Escuela).md`, y reescribí `cerebrus/wiki/hot.md` con el contexto más reciente.
- No lo hagas automáticamente en cada mensaje — solo al cierre de sesiones con trabajo real, o cuando te lo pidan explícitamente.
