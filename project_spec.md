# Plataforma de Formación Deportiva — Prompt Maestro para Claude Code

## 1. CONTEXTO Y OBJETIVO

Quiero construir una plataforma web de formación institucional/deportiva orientada inicialmente a organizaciones deportivas de Uruguay, pero diseñada desde el día 1 como una plataforma **multi-tenant y completamente genérica**, sin asumir deportes, federaciones, categorías o estructuras deportivas específicas.

La plataforma permitirá que diferentes organizaciones utilicen el sistema de forma independiente.

Cada organización tendrá sus propios:

- Administradores
- Profesores
- Estudiantes
- Grupos
- Cursos
- Inscripciones
- Evaluaciones
- Resultados
- Estadísticas

Los datos de una organización deben estar completamente aislados de los de otras organizaciones.

No habrá pagos dentro de la aplicación.

El objetivo es construir un LMS moderno, institucional y orientado específicamente a formación deportiva, evitando la complejidad y UX de plataformas tradicionales como Moodle.

La aplicación debe ser moderna, responsive y especialmente usable desde teléfonos móviles.

---

# 2. STACK TECNOLÓGICO

Utilizar el siguiente stack salvo que exista una razón técnica muy fuerte para proponer una alternativa:

### Frontend

- Next.js
- TypeScript
- React
- App Router
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack React Query

### Backend / infraestructura

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security (RLS)

### Video

Los videos NO se almacenarán en nuestra infraestructura.

Los administradores/profesores podrán utilizar videos alojados en YouTube y la plataforma almacenará/referenciará la URL o identificador del video.

### Deployment

Diseñar la aplicación pensando en deployment en Vercel + Supabase.

---

# 3. PRINCIPIOS ARQUITECTÓNICOS

Priorizar:

1. Simplicidad.
2. Mantenibilidad.
3. Seguridad.
4. Separación clara de responsabilidades.
5. Multi-tenancy real.
6. Tipado fuerte.
7. Reutilización de componentes.
8. Buena UX.
9. Accesibilidad.
10. Escalabilidad razonable.

No sobre-ingenierizar el MVP.

No introducir microservicios.

No introducir herramientas innecesarias.

La aplicación debe comenzar como un monolito modular en Next.js.

Utilizar una arquitectura feature-based.

Por ejemplo:

```text
src/
  app/
  features/
    auth/
    organizations/
    users/
    groups/
    courses/
    enrollments/
    assessments/
    questions/
    analytics/
    admin/
  components/
  lib/
  hooks/
  types/
```

La estructura exacta puede ajustarse si existe una mejor organización, pero mantener separación clara por dominio.

---

# 4. MULTI-TENANCY

Este punto es CRÍTICO.

La plataforma debe soportar múltiples organizaciones.

Ejemplo:

```text
Platform
│
├── Organization A
│   ├── Admins
│   ├── Professors
│   ├── Students
│   ├── Groups
│   └── Courses
│
├── Organization B
│   ├── Admins
│   ├── Professors
│   ├── Students
│   ├── Groups
│   └── Courses
│
└── Organization C
```

Una organización jamás debe poder acceder a datos de otra organización.

El aislamiento debe implementarse principalmente mediante:

- `organization_id`
- PostgreSQL Row Level Security
- Policies apropiadas
- Validación de permisos en backend/server actions/API
- Nunca confiar únicamente en controles del frontend

No utilizar simplemente filtros en React como mecanismo de seguridad.

El backend/database debe ser la autoridad.

---

# 5. ROLES

Existen cuatro roles principales.

## 5.1 Super Admin

Administra toda la plataforma.

Puede:

- Crear organizaciones.
- Editar organizaciones.
- Desactivar organizaciones.
- Crear/administrar Organization Admins.
- Ver información global.
- Ver estadísticas globales.
- Ver estadísticas por organización.
- Acceder a información de todas las organizaciones.
- Administrar configuraciones globales.

El Super Admin es el único rol con acceso cross-tenant.

---

# 5.2 Organization Admin

Administra una organización específica.

Puede:

- Ver y administrar usuarios de su organización.
- Crear/invitar profesores.
- Administrar profesores.
- Generar links de registro de la organización.
- Ver estudiantes.
- Crear grupos.
- Administrar grupos.
- Crear cursos.
- Editar cursos.
- Publicar cursos.
- Archivar cursos.
- Eliminar cursos cuando corresponda.
- Asignar grupos a las ediciones de los cursos.
- Ver resultados.
- Ver estadísticas.
- Ver estadísticas de cursos.
- Ver estadísticas de estudiantes.
- Ver estadísticas de profesores.
- Configurar escalas/rangos de evaluación de su organización.
- Administrar la información administrativa de los cursos.

El Organization Admin tiene control administrativo, pero no debe necesitar participar en la creación de contenido académico si existe un profesor encargado.

---

# 5.3 Professor

Los profesores pertenecen a una organización.

Un profesor puede estar asociado a múltiples cursos.

Un curso puede tener múltiples profesores.

El profesor NO puede:

- Crear cursos.
- Eliminar cursos.
- Administrar organizaciones.
- Administrar usuarios globalmente.
- Administrar grupos como entidad administrativa.

El profesor SÍ puede editar el contenido de los cursos a los que está asociado.

Puede:

- Ver sus cursos.
- Editar módulos.
- Editar lecciones.
- Crear contenido dentro de las lecciones.
- Eliminar contenido dentro de las lecciones.
- Reordenar contenido.
- Crear evaluaciones.
- Editar evaluaciones.
- Crear preguntas.
- Administrar bancos de preguntas.
- Crear preguntas multiple-choice.
- Crear consignas abiertas.
- Configurar evaluaciones.
- Ver estudiantes relacionados con sus cursos.
- Ver respuestas.
- Corregir consignas abiertas.
- Asignar puntaje a respuestas abiertas.
- Agregar feedback.
- Ver resultados.

La idea es que:

> El Admin controla la parte administrativa del curso. El Profesor controla la parte académica y de contenido.

---

# 5.4 Student

Puede:

- Ver sus cursos activos.
- Ver cursos asignados.
- Ver cursos gratuitos.
- Ver progreso.
- Ver módulos disponibles.
- Ver módulos bloqueados.
- Ver módulos próximos a habilitarse.
- Consumir contenido.
- Marcar contenido como completado.
- Realizar quizzes.
- Realizar evaluaciones.
- Recuperar evaluaciones interrumpidas.
- Ver resultados.
- Ver feedback de profesores.
- Ver cursos anteriores.
- Ver cursos finalizados.

---

# 6. AUTENTICACIÓN

La autenticación será passwordless mediante:

```text
Email
  ↓
OTP enviado al email
  ↓
Autenticación
```

No utilizar contraseña como mecanismo principal.

No necesitamos recuperación de contraseña tradicional porque no habrá password.

El flujo de recuperación/acceso debe consistir en volver a solicitar un OTP.

Utilizar Supabase Auth.

La autenticación debe contemplar:

- Login.
- Registro.
- Logout.
- OTP.
- Verificación de email mediante OTP.
- Sesión persistente.
- Expiración de sesión.
- Manejo de errores.

---

# 7. REGISTRO DE USUARIOS

Los usuarios no se registran libremente en la plataforma.

Un usuario debe ser asociado inicialmente a una organización.

El Organization Admin puede generar un:

```text
Organization Registration Link
```

Ejemplo:

```text
https://platform.example/register/abc123
```

El link NO corresponde a un curso.

El link simplemente determina la organización a la que pertenecerá inicialmente el usuario.

Flujo:

```text
Organization Admin
       ↓
Generate registration link
       ↓
Share link
       ↓
User opens link
       ↓
Enters email
       ↓
Receives OTP
       ↓
Authenticates
       ↓
Completes profile
       ↓
Becomes member of organization
       ↓
Organization Admin assigns user to groups
```

El objetivo es evitar que un administrador tenga que invitar manualmente a 100 personas cada vez que comienza una actividad.

El link debe poder:

- Activarse/desactivarse.
- Tener una fecha de expiración opcional.
- Identificar la organización.
- Ser revocado.

No permitir que un link pueda utilizarse para acceder a otra organización.

---

# 8. USER PROFILE

Los usuarios deben tener como mínimo:

```text
First name
Last name
Email
Phone
DNI
Role
Organization
```

No hardcodear deportes ni categorías en el modelo.

La plataforma debe ser genérica.

---

# 9. COURSE MODEL

La estructura conceptual de un curso es:

```text
Course
│
├── Modules
│   │
│   ├── Lessons
│   │   │
│   │   └── Content Blocks
│   │
│   └── Assessments
│
└── Dependencies
```

Un curso debe tener:

- ID
- Organización
- Nombre
- Descripción
- Imagen opcional
- Estado
- Profesores
- Módulos
- Configuración
- Fecha de creación
- Fecha de publicación
- Fecha de archivo

Estados iniciales:

```text
DRAFT
PUBLISHED
ARCHIVED
```

No permitir que un alumno vea cursos `DRAFT` o `ARCHIVED` como cursos activos.

---

# 10. CURSOS PÚBLICOS Y PRIVADOS

Existen solamente dos tipos:

```text
FREE
PRIVATE
```

## FREE

El curso está disponible para usuarios de la plataforma según las reglas de la organización.

## PRIVATE

El curso se asigna mediante grupos.

No implementar otros mecanismos de acceso en el MVP.

---

# 11. COURSE OFFERING / COHORT

Esta es una entidad FUNDAMENTAL.

No asumir:

```text
Course → Students
```

porque un mismo curso puede estar siendo cursado simultáneamente por diferentes grupos en diferentes partes del programa.

Ejemplo:

```text
Course:
"Fundamentos del Entrenamiento"

        │
        ├── Offering A
        │     └── Group 1
        │           └── Students
        │
        └── Offering B
              └── Group 2
                    └── Students
```

Ejemplo real:

```text
Grupo 1
Semestre 1
Módulo 1

Grupo 2
Semestre 5
Módulo 5
```

Ambos están utilizando el mismo curso y el mismo contenido.

Por lo tanto:

### Course

Representa:

> Qué se enseña.

### Course Offering

Representa:

> Una ejecución/cohorte específica de ese curso.

El Course Offering debe poder tener:

- Course ID
- Organization ID
- Group ID
- Start date
- End date
- Status
- Configuration específica si fuera necesaria

El contenido pertenece al `Course`.

El progreso pertenece al `Enrollment`.

No mezclar contenido con ejecución.

---

# 12. GROUPS

Los grupos pertenecen a una organización.

En general, los grupos se crearán específicamente para una ejecución de un curso.

Ejemplo:

```text
Course:
Preparación Física

Offering:
Preparación Física — 2026 S1

Group:
Entrenadores 2026 S1
```

No asumir que un grupo será necesariamente reutilizado en múltiples cursos.

Sin embargo, no diseñar el modelo de forma que técnicamente sea imposible reutilizarlo en el futuro.

---

# 13. COURSE ENROLLMENT

Introducir explícitamente:

```text
CourseEnrollment
```

No representar simplemente la relación User ↔ Course.

Un Enrollment debe guardar información como:

```text
id
user_id
course_id
course_offering_id
status
source
enrolled_at
started_at
completed_at
due_date
progress
```

El `source` debe permitir distinguir al menos:

```text
GROUP_ASSIGNMENT
FREE_COURSE
```

Esto permite que el estudiante pueda visualizar:

```text
Mis cursos

Cursos asignados
  - En curso
  - Finalizados

Cursos gratuitos
  - En curso
  - Finalizados
```

El progreso debe estar asociado al enrollment correspondiente.

---

# 14. MODULES

Un curso tiene múltiples módulos.

Cada módulo debe tener:

```text
id
course_id
title
description
order
available_from
available_until
status
```

Los módulos pueden tener:

- Fecha de habilitación.
- Fecha de expiración/caducidad.
- Dependencias.

No asumir que todos los módulos deben estar disponibles desde el principio.

---

# 15. MODULE DEPENDENCIES

El sistema debe permitir definir dependencias entre módulos.

Ejemplo:

```text
Module 1
   ↓
Module 2
   ↓
Module 3
```

Pero también:

```text
Module 1 ─────┐
              ├── Module 3
Module 2 ─────┘
```

Y debe ser posible que un módulo no tenga dependencia.

El admin/profesor debe poder configurar qué módulo depende de cuál.

Las condiciones para desbloquear un módulo pueden incluir:

- Completar módulos anteriores.
- Aprobar un quiz.
- Completar una tarea.
- Cumplir varias condiciones.

Diseñar esto de forma extensible, pero evitar sobre-ingeniería en el MVP.

---

# 16. LESSONS

Cada módulo tiene múltiples lecciones.

```text
Module
│
├── Lesson 1
├── Lesson 2
├── Lesson 3
└── Lesson 4
```

Las lecciones tienen un orden configurable.

El profesor debe poder:

- Crear.
- Editar.
- Eliminar.
- Reordenar.

---

# 17. CONTENT BLOCKS

Una lección puede tener uno o múltiples bloques de contenido.

Esto es importante.

NO modelar una lección como:

```text
Lesson
type = VIDEO | PDF | TEXT
```

porque una lección puede contener varios tipos.

En cambio:

```text
Lesson
│
├── Content Block
├── Content Block
├── Content Block
└── Content Block
```

Los bloques deben tener:

```text
id
lesson_id
type
order
data
```

Tipos iniciales:

```text
YOUTUBE_VIDEO
RICH_TEXT
PDF
IMAGE
EXTERNAL_LINK
QUIZ
TASK
```

Ejemplo:

```text
Lección: Principios defensivos

1. Video YouTube
2. Texto explicativo
3. PDF
4. Imagen
5. Quiz
```

El profesor debe poder:

- Agregar bloques.
- Editar bloques.
- Eliminar bloques.
- Reordenar bloques.

---

# 18. YOUTUBE

Los videos serán alojados externamente en YouTube.

La aplicación debe almacenar el identificador/URL necesario para renderizar el video.

No implementar hosting de video propio.

Para el MVP, el alumno debe poder marcar manualmente el video/contenido como completado.

No intentar determinar automáticamente cuánto tiempo vio el video.

---

# 19. FILE STORAGE

Los contenidos que no sean video pueden almacenarse en Supabase Storage.

Ejemplos:

- PDFs.
- Imágenes.
- Otros documentos.

Diseñar buckets y políticas de acceso considerando multi-tenancy.

Nunca permitir que un usuario de una organización pueda acceder arbitrariamente a archivos de otra organización.

---

# 20. CONTENT COMPLETION

El sistema debe registrar qué contenido completó un alumno.

Ejemplo:

```text
Enrollment
  ↓
Module
  ↓
Lesson
  ↓
Content Block
  ↓
Completed
```

Para el MVP, los contenidos se pueden marcar manualmente como completados.

No asumir que abrir un contenido implica completarlo.

---

# 21. QUIZZES Y ASSESSMENTS

Existen dos conceptos principales.

## Quiz dentro de un módulo

Sirve como actividad de aprendizaje.

Características:

- Forma parte de un módulo.
- Intentos ilimitados.
- Multiple choice.
- Corrección automática.
- Puede ser requisito para desbloquear contenido/módulo.

## General Assessment

Es una evaluación formal.

Características:

- Puede estar asociada al curso.
- Un solo intento.
- Tiene ventana de disponibilidad.
- Tiene duración.
- Puede usar banco de preguntas.
- Preguntas aleatorias.
- Puede incluir multiple choice y consignas abiertas.
- El resultado es revisado/consultado por el profesor.

---

# 22. QUESTION BANK

Debe existir un banco de preguntas.

Los profesores deben poder:

- Crear preguntas.
- Editar preguntas.
- Desactivar preguntas.
- Clasificarlas si resulta útil.
- Reutilizarlas en evaluaciones.

Una evaluación no necesariamente debe almacenar una copia completa de las preguntas en su definición.

Sin embargo, cuando un alumno comienza un intento, se debe generar un snapshot de las preguntas seleccionadas para que una modificación posterior del banco no altere una evaluación que ya está en progreso.

Esta decisión es importante para la integridad de los resultados.

---

# 23. QUESTION TYPES

Inicialmente:

## Multiple Choice

Ejemplo:

```text
¿Cuál es la opción correcta?

A. ...
B. ...
C. ...
D. ...
```

Puede existir una única respuesta correcta.

La corrección es automática.

## Open-ended / Task

Ejemplo:

```text
Explicá cómo resolverías esta situación...
```

El alumno recibe un textarea/editor para ingresar su respuesta.

El profesor posteriormente puede:

- Leer la respuesta.
- Asignar puntaje.
- Escribir feedback.
- Marcar el resultado correspondiente.

---

# 24. ASSESSMENT CONFIGURATION

El profesor tiene control completo sobre la configuración de una evaluación.

No requerir intervención del Organization Admin.

Debe poder configurar:

- Nombre.
- Descripción.
- Preguntas.
- Banco de preguntas.
- Cantidad de preguntas aleatorias.
- Tipo de preguntas.
- Fecha/hora desde la que se puede comenzar.
- Fecha/hora límite para comenzar.
- Duración máxima.
- Puntaje mínimo si aplica.
- Número de intentos.
- Feedback.

No introducir friction innecesaria con el administrador.

---

# 25. RANDOM QUESTIONS

Las evaluaciones pueden utilizar un banco de preguntas.

Ejemplo:

```text
Question Bank:
100 questions

Assessment:
20 questions

Student A:
20 random questions

Student B:
20 random questions
```

El sistema debe seleccionar preguntas de forma aleatoria.

Una vez que un alumno comienza un intento, las preguntas asignadas deben quedar persistidas.

Si el alumno pierde conexión y vuelve a entrar, debe recuperar exactamente el mismo conjunto de preguntas y respuestas.

---

# 26. ASSESSMENT TIME WINDOW

Una evaluación puede definir una ventana:

```text
Available from: 15:00
Available until: 17:00
Duration: 45 minutes
```

El alumno puede comenzar únicamente dentro de la ventana.

IMPORTANTE:

La hora de finalización de la ventana es un límite absoluto.

Ejemplo:

```text
Start: 16:40
Window closes: 17:00
Duration: 45 min
```

El alumno NO puede continuar hasta 17:25.

La evaluación se entrega automáticamente a las:

```text
17:00
```

con todas las respuestas guardadas hasta ese momento.

Por lo tanto:

```text
effective_end_time =
min(start_time + duration, availability_end)
```

El servidor debe ser la autoridad sobre el tiempo.

No confiar en el reloj del cliente.

---

# 27. ASSESSMENT ATTEMPTS

Para quizzes dentro de módulos:

```text
Unlimited attempts
```

Para evaluaciones generales:

```text
1 attempt
```

El intento debe tener estados similares a:

```text
NOT_STARTED
IN_PROGRESS
SUBMITTED
AUTO_SUBMITTED
GRADED
```

Diseñar el sistema para distinguir claramente entre:

- Intento activo.
- Intento enviado por el usuario.
- Intento enviado automáticamente por timeout.
- Intento corregido.

---

# 28. DISCONNECTION / RESILIENCE

Este requisito es CRÍTICO.

Si un alumno pierde la conexión durante una evaluación:

> NO debe perder su progreso.

El sistema debe guardar periódicamente:

- Respuestas.
- Estado del intento.
- Última actividad.
- Tiempo relevante.
- Preguntas seleccionadas.

El cliente puede hacer autosave/debounced save, pero el backend/database debe almacenar el estado.

Al volver a conectarse:

```text
Resume assessment
```

y recuperar exactamente el estado anterior.

Diseñar esto pensando en conexiones móviles inestables.

---

# 29. MULTIPLE TABS / SESSIONS

Debe existir protección contra múltiples sesiones simultáneas de una misma evaluación.

Un alumno no debe poder tener la misma evaluación abierta en dos pestañas activas.

Implementar un mecanismo de sesión de assessment.

Conceptualmente:

```text
Assessment Attempt
        │
        └── Active Session
```

Usar:

- Session ID.
- Heartbeat.
- Last activity.
- Server validation.

Si se abre una segunda pestaña:

```text
This assessment is already open in another session.
```

La segunda sesión debe quedar bloqueada.

Si el usuario cierra accidentalmente la pestaña original, debe poder recuperar su intento posteriormente.

No bloquear permanentemente el intento debido a una pestaña cerrada.

---

# 30. SERVER AUTHORITY

Para evaluaciones, el servidor debe ser la autoridad para:

- Inicio del intento.
- Tiempo restante.
- Disponibilidad.
- Estado del intento.
- Cantidad de intentos.
- Preguntas asignadas.
- Submit.
- Expiración.

Nunca confiar solamente en lógica JavaScript del cliente para estas reglas.

---

# 31. AUTOMATIC SUBMISSION

Cuando se alcanza:

```text
effective_end_time
```

el sistema debe automáticamente enviar la evaluación.

Debe persistir todas las respuestas disponibles en ese momento.

No requerir que el alumno presione "Submit".

---

# 32. GRADING

Multiple choice:

```text
Automatic grading
```

Open-ended:

```text
Professor grading
```

El profesor puede:

- Ver respuesta.
- Asignar puntaje.
- Escribir feedback.

IMPORTANTE:

Por ahora NO implementar un cálculo automático de "final course score" combinando todas las actividades.

Los resultados deben existir y poder ser consultados, pero no implementar todavía un sistema complejo de weighted final grades.

---

# 33. SCORE SCALE

La organización debe poder configurar cómo se interpretan los puntajes.

Debe existir una sección:

```text
Organization Settings
  → Assessment / Score Settings
```

El admin podrá configurar rangos y labels.

Ejemplo:

```text
90 - 100 → Excelente
80 - 89  → Muy bueno
70 - 79  → Bueno
0 - 69   → No aprobado
```

No hardcodear estos labels.

Diseñar la configuración para que pueda cambiarse por organización.

---

# 34. FEEDBACK

Los profesores pueden dejar feedback sobre:

- Respuestas abiertas.
- Evaluaciones.
- Tareas.

Los estudiantes deben poder visualizar:

```text
Score
Feedback
```

cuando esté disponible.

---

# 35. COURSE PROGRESSION

El curso debe poder desbloquear progresivamente módulos.

Ejemplo:

```text
Module 1
   ↓ completed
Module 2
   ↓ quiz passed
Module 3
   ↓
Module 4
```

Pero también debe permitir configuraciones donde:

```text
Todos los módulos están disponibles desde el principio.
```

La disponibilidad de un módulo debe depender de:

- Fecha.
- Dependencias.
- Progreso del alumno.

---

# 36. COURSE EXPIRATION

El curso/edición puede tener una fecha límite.

Además, los módulos pueden tener fechas propias.

Ejemplo:

```text
Course:
01/03 → 30/06

Module 1:
01/03 → 15/03

Module 2:
16/03 → 31/03

Module 3:
01/04 → 30/04
```

El sistema debe manejar correctamente estas fechas.

---

# 37. STUDENT DASHBOARD

El estudiante debe tener una experiencia simple.

Dashboard:

```text
Mis cursos

Cursos asignados
----------------
Curso A
En curso
65%

Curso B
En curso
20%

Curso C
Finalizado
100%

Cursos gratuitos
----------------
Curso D
En curso
40%

Curso E
Finalizado
100%
```

También debe poder consultar:

- Cursos activos.
- Cursos anteriores.
- Estado.
- Progreso.
- Próximo módulo.
- Módulos bloqueados.
- Evaluaciones pendientes.
- Resultados disponibles.

---

# 38. ORGANIZATION ADMIN DASHBOARD

El admin debe poder visualizar:

```text
Dashboard
│
├── Students
├── Professors
├── Courses
├── Groups
├── Assessments
├── Results
└── Analytics
```

Debe poder ver estadísticas como:

### Students

- Total.
- Activos.
- Cursos iniciados.
- Cursos completados.

### Courses

- Cursos publicados.
- Cursos en progreso.
- Cursos completados.
- Cantidad de alumnos.
- Progreso promedio.

### Professors

- Cursos asociados.
- Actividad.
- Evaluaciones corregidas.
- Otros indicadores útiles.

### Assessments

- Cantidad de participantes.
- Aprobados.
- No aprobados.
- Promedio.
- Distribución de resultados.

No hace falta implementar dashboards extremadamente sofisticados en el primer MVP.

Priorizar datos útiles y correctos.

---

# 39. SUPER ADMIN ANALYTICS

El Super Admin debe poder ver estadísticas agregadas y por organización.

Ejemplo:

```text
All organizations

Organization A
  300 students
  12 courses
  850 enrollments

Organization B
  120 students
  6 courses
  320 enrollments
```

Nunca exponer información de una organización a otra.

---

# 40. AUDIT LOG

Implementar Audit Log desde el MVP.

Registrar eventos relevantes.

Ejemplos:

```text
Admin created course
Admin published course
Admin archived course
Admin created group
Admin generated registration link

Professor updated lesson
Professor added assessment
Professor modified question
Professor graded response

Student started assessment
Student submitted assessment
Assessment auto-submitted
Student completed lesson
```

El audit log debe incluir al menos:

```text
id
organization_id
actor_user_id
action
entity_type
entity_id
metadata
created_at
```

El Super Admin puede acceder a todo.

El Organization Admin solamente a eventos de su organización.

---

# 41. SECURITY

La seguridad es prioridad.

Implementar:

- Supabase RLS.
- Multi-tenant isolation.
- Role-based authorization.
- Server-side permission checks.
- Validación con Zod.
- Validación de ownership.
- Protección de archivos.
- Protección de assessment attempts.
- Server-side timing validation.
- Rate limiting donde sea necesario.
- No exponer información sensible innecesariamente.

Nunca asumir que esconder una opción en el frontend es autorización.

Ejemplo:

Aunque el frontend esconda:

```text Delete course
```

un usuario no autorizado no debe poder ejecutar el request directamente.

---

# 42. DATABASE DESIGN

Antes de implementar, diseñar cuidadosamente el schema.

Entidades esperadas como mínimo:

```text
organizations
organization_settings

users / profiles
organization_memberships
organization_registration_links

groups
group_members

courses
course_professors
course_offerings

modules
module_dependencies

lessons
lesson_content_blocks

course_enrollments
content_progress

question_banks
questions
question_options

assessments
assessment_questions
assessment_attempts
assessment_attempt_questions
assessment_answers

assessment_feedback / grading data

audit_logs
```

No asumir que esta lista es definitiva.

Analizar relaciones y proponer el modelo correcto.

Evitar duplicación.

Usar foreign keys apropiadas.

Usar índices para queries frecuentes.

Agregar timestamps.

Definir estados como enums cuando tenga sentido.

No usar enums para conceptos que deban ser configurables por organización.

---

# 43. RLS

Diseñar RLS como parte de la arquitectura, no como algo para agregar al final.

Ejemplos de reglas:

### Student

Puede acceder únicamente a:

- Su perfil.
- Su organización.
- Sus enrollments.
- Cursos a los que tiene acceso.
- Contenido correspondiente.
- Sus intentos.
- Sus respuestas.
- Sus resultados.

### Professor

Puede acceder a:

- Su organización.
- Cursos a los que está asociado.
- Contenido de esos cursos.
- Evaluaciones de esos cursos.
- Resultados necesarios para corregir.

### Organization Admin

Puede acceder a:

- Toda la información de su organización.

### Super Admin

Puede acceder a todas las organizaciones.

Validar cuidadosamente las implicaciones de usar Supabase Auth + RLS.

---

# 44. UX / UI

La plataforma debe sentirse como una plataforma institucional/deportiva moderna.

No copiar visualmente Moodle.

Priorizar:

- Simplicidad.
- Claridad.
- Jerarquía visual.
- Responsive.
- Mobile-first.
- Navegación simple.
- Estados claros.
- Feedback inmediato.

Usar shadcn/ui como base de componentes.

Crear componentes reutilizables.

No duplicar UI entre páginas.

---

# 45. ADMIN COURSE BUILDER

La creación/edición de cursos debe ser una de las partes más importantes del producto.

El admin crea el curso:

```text
Course
 ↓
Modules
 ↓
Lessons
 ↓
Content Blocks
```

Los profesores luego pueden editar el contenido.

El builder debería permitir:

- Crear módulos.
- Reordenar módulos.
- Configurar dependencias.
- Configurar fechas.
- Crear lecciones.
- Reordenar lecciones.
- Agregar bloques.
- Reordenar bloques.
- Editar contenido.
- Crear evaluaciones.
- Publicar según permisos.

No construir inicialmente un drag-and-drop extremadamente complejo si no es necesario.

Priorizar una experiencia robusta y sencilla.

---

# 46. COURSE PUBLISHING

Separar claramente:

```text
Draft
Published
Archived
```

Un curso draft puede ser editado libremente.

Un curso publicado puede ser utilizado por estudiantes.

Un curso archivado no debe aceptar nuevos enrollments.

Considerar cuidadosamente qué pasa cuando se edita un curso que ya está siendo cursado.

Para el MVP:

> Los cambios de contenido se reflejan en el curso actual.

No implementar versionado completo de cursos todavía.

Sin embargo, diseñar el código de manera que el versionado pueda incorporarse posteriormente.

---

# 47. COURSE CONCURRENCY

Es importante que el mismo curso pueda tener múltiples offerings activos.

Ejemplo:

```text
Course:
Advanced Coaching

Offering 1:
Group A
Module 1

Offering 2:
Group B
Module 4

Offering 3:
Group C
Module 7
```

Todos utilizan el mismo contenido.

El progreso nunca debe mezclarse entre ellos.

---

# 48. FREE COURSES

Los cursos gratuitos deben poder ser identificados como tales.

El estudiante debe poder descubrirlos desde una sección separada.

El acceso no requiere una asignación administrativa.

No confundir:

```text
FREE course
```

con:

```text
PRIVATE course assigned to a group
```

---

# 49. NO PAYMENTS

No implementar:

- Stripe.
- Mercado Pago.
- Checkout.
- Billing.
- Subscriptions.
- Payment methods.

La plataforma no tiene pagos.

---

# 50. NO CERTIFICATES

No implementar certificados online en el MVP.

Puede quedar preparado para futuro, pero no agregar complejidad ahora.

---

# 51. PERFORMANCE

La aplicación debe estar preparada para aproximadamente:

```text
100–500 concurrent assessment participants
```

durante evaluaciones.

Diseñar especialmente bien:

- Assessment attempt persistence.
- Autosave.
- Database writes.
- Indexes.
- Concurrency.
- Session locking.
- Auto-submit.
- Recovery after disconnection.

No realizar polling excesivo.

Preferir estrategias eficientes de autosave/debounce y heartbeat.

---

# 52. IMPORTANT ASSESSMENT CONCURRENCY SCENARIO

Debe ser posible soportar:

```text
500 students

all start an assessment
within a short period

each student:
- receives randomized questions
- answers questions
- autosaves
- may disconnect
- reconnects
- submits
```

La implementación no debe depender de memoria del servidor para conservar el estado.

El estado importante debe estar persistido.

---

# 53. ERROR HANDLING

Implementar estados de error claros.

Ejemplos:

```text
Course unavailable
Module locked
Assessment not available
Assessment expired
Assessment already completed
Another session is active
Connection temporarily unavailable
Unable to save answer
```

Durante evaluaciones:

> Si una respuesta no pudo guardarse, el usuario debe recibir feedback claro y el sistema debe intentar recuperarse.

No ocultar silenciosamente errores críticos.

---

# 54. ACCESSIBILITY

Utilizar buenas prácticas de accesibilidad:

- Semantic HTML.
- Keyboard navigation.
- Proper labels.
- Focus states.
- Accessible dialogs.
- Accessible forms.
- Screen-reader-friendly errors.
- Sufficient contrast.

Especial atención a:

- Assessment UI.
- Forms.
- Course navigation.
- Progress indicators.

---

# 55. TESTING

El MVP debe incluir testing.

Priorizar:

### Unit tests

Para lógica crítica:

- Permission checks.
- Module unlock rules.
- Assessment timing.
- Assessment expiration.
- Random question selection.
- Score calculation.
- Enrollment state.
- Session locking.

### Integration tests

Para:

- Auth.
- Course enrollment.
- Assessment attempts.
- Autosave.
- Submit.
- Auto-submit.

### E2E

Al menos cubrir:

```text
Admin creates course
Admin creates offering/group
Student registers
Student gets enrolled
Student progresses
Student takes quiz
Student starts assessment
Student loses connection
Student reconnects
Student submits
Professor grades
Student sees feedback
```

---

# 56. DEVELOPMENT APPROACH

NO implementar toda la plataforma de una sola vez.

Trabajar en fases.

Antes de escribir código significativo:

## Phase 0 — Architecture

Crear documentación:

```text
docs/
  architecture.md
  domain-model.md
  database-schema.md
  authorization.md
  assessment-design.md
  roadmap.md
```

Definir:

- Arquitectura.
- Entidades.
- Relaciones.
- RLS.
- Roles.
- Flujos.
- Assessment lifecycle.

Si encontrás ambigüedades importantes, señalarlas antes de implementar.

No detener todo el proyecto por detalles menores.

Tomar decisiones razonables y documentarlas.

---

# 57. PHASE 1 — FOUNDATION

Implementar:

- Next.js.
- TypeScript.
- Tailwind.
- shadcn.
- Supabase.
- Database foundation.
- Auth.
- User profiles.
- Organizations.
- Organization memberships.
- Roles.
- RLS.

Crear seed data para desarrollo.

---

# 58. PHASE 2 — ORGANIZATION ADMIN

Implementar:

- Organization dashboard.
- Users.
- Professors.
- Organization registration links.
- Groups.
- Organization settings.

---

# 59. PHASE 3 — COURSES

Implementar:

- Course CRUD.
- Course states.
- Professors associated with courses.
- Course offerings.
- Groups.
- Enrollments.
- Modules.
- Dependencies.
- Dates.
- Lessons.
- Content blocks.

---

# 60. PHASE 4 — STUDENT EXPERIENCE

Implementar:

- Student dashboard.
- Assigned courses.
- Free courses.
- Course detail.
- Module progression.
- Lesson navigation.
- Content completion.
- Locked modules.
- Progress.

---

# 61. PHASE 5 — ASSESSMENTS

Implementar cuidadosamente:

- Question bank.
- Questions.
- Multiple choice.
- Open-ended questions.
- Quizzes.
- General assessments.
- Randomization.
- Attempts.
- Timing.
- Availability window.
- Autosave.
- Recovery.
- Session locking.
- Auto-submit.
- Grading.
- Feedback.

Esta fase merece especial atención.

---

# 62. PHASE 6 — ANALYTICS

Implementar:

- Organization statistics.
- Course statistics.
- Student statistics.
- Professor statistics.
- Assessment statistics.
- Super Admin global statistics.

No construir analytics innecesariamente complejos.

---

# 63. PHASE 7 — AUDIT / HARDENING

Implementar:

- Audit log UI donde corresponda.
- Security review.
- RLS review.
- Permission review.
- Performance review.
- Assessment concurrency review.
- Error handling review.
- Accessibility review.
- E2E testing.

---

# 64. CLAUDE CODE WORKFLOW

Quiero que trabajes como un senior engineer y no simplemente como un generador de código.

Para cada fase:

1. Analiza los requisitos.
2. Revisa el código existente.
3. Propone una implementación.
4. Identifica riesgos.
5. Implementa.
6. Ejecuta tests.
7. Ejecuta lint/typecheck.
8. Revisa el resultado.
9. Corrige problemas.
10. Documenta decisiones importantes.

No realizar grandes cambios sin entender primero el código existente.

Antes de crear nuevas abstracciones, buscar si ya existe algo reutilizable.

Evitar duplicación.

---

# 65. CODE QUALITY

Preferir:

- TypeScript strict.
- Funciones pequeñas.
- Nombres descriptivos.
- Tipos explícitos cuando mejoren claridad.
- Server-side validation.
- Reusable components.
- Domain-specific utilities.
- Clear separation between UI and business logic.

Evitar:

- `any`.
- Large monolithic components.
- Business logic directamente dentro de componentes visuales.
- Duplicated permission checks.
- Magic strings.
- Hardcoded organization IDs.
- Hardcoded sports.
- Hardcoded score labels.
- Hardcoded course IDs.
- Client-only authorization.
- Business rules solamente en frontend.

---

# 66. DATA ACCESS

Definir una estrategia clara para acceder a Supabase.

No hacer queries arbitrarias desde cualquier componente.

Separar:

```text
UI
 ↓
Feature/domain logic
 ↓
Data access
 ↓
Supabase
```

Las operaciones sensibles deben ejecutarse server-side.

Utilizar React Query donde tenga sentido para client-side server state.

No utilizar React Query indiscriminadamente para datos que Next.js Server Components pueda manejar mejor.

---

# 67. SERVER VS CLIENT COMPONENTS

Usar Server Components por defecto.

Usar Client Components solamente cuando sea necesario:

- Interactividad.
- Forms.
- Drag/drop.
- Timers.
- Assessment interaction.
- Browser APIs.
- React Query client state.

No convertir toda la aplicación en Client Components.

---

# 68. ASSESSMENT TIMER ARCHITECTURE

El timer del cliente es únicamente una representación visual.

El servidor debe almacenar/calcular:

```text
started_at
duration
availability_end
```

y derivar:

```text
effective_end_time
```

El frontend debe sincronizar periódicamente con el servidor.

Si el reloj del usuario está incorrecto, eso no debe alterar el resultado.

---

# 69. ASSESSMENT AUTOSAVE

Diseñar una estrategia que reduzca writes innecesarios.

Por ejemplo:

- Save inmediatamente después de cambios importantes.
- Debounce para respuestas.
- Batch si resulta apropiado.
- Heartbeat separado.
- Flush antes de submit.

No depender de `beforeunload` como única forma de persistencia.

---

# 70. FUTURE EXTENSIBILITY

No implementar todavía, pero no cerrar la puerta a:

- Certificados.
- Más tipos de preguntas.
- SCORM.
- Live classes.
- Zoom/Meet.
- Notifications.
- Email notifications.
- Push notifications.
- Course versioning.
- Advanced analytics.
- Badges.
- Completion certificates.
- Mobile application.
- Custom branding por organización.

No construir estas funcionalidades ahora.

---

# 71. IMPORTANT PRODUCT DECISIONS

Estas decisiones son intencionales:

### No payments

La plataforma es gratuita desde el punto de vista de pagos internos.

### No certificates

Fuera del MVP.

### No password

Authentication mediante OTP.

### No course join links

Los links sirven para registrarse en una organización, no para inscribirse directamente a cursos.

### Admin creates courses

El profesor no puede crear/eliminar cursos.

### Professor owns content

El profesor puede editar completamente el contenido de los cursos asociados.

### Course ≠ Offering

El mismo curso puede tener múltiples cohortes simultáneamente.

### Group is generally course-specific

Los grupos normalmente se crean para una ejecución particular de un curso.

### Unlimited module quizzes

Los quizzes de aprendizaje pueden realizarse ilimitadamente.

### One general assessment attempt

Las evaluaciones formales tienen un único intento.

### Manual open-ended grading

Las respuestas abiertas son corregidas por profesores.

### No automatic final course grade

Por ahora no calcular un grade final global del curso.

### Manual content completion

El alumno marca contenido como completado.

### YouTube videos

No almacenar video propio.

### Organization-configurable score labels

No hardcodear escalas/rangos.

### Audit log from MVP

La auditoría es parte del MVP.

---

# 72. FIRST TASK

NO empieces creando todas las pantallas.

Tu primera tarea es:

## 1. Analizar este documento completo.

## 2. Identificar cualquier inconsistencia o decisión arquitectónica pendiente.

## 3. Proponer:

- Arquitectura de aplicación.
- Domain model.
- Database schema.
- Role/permission matrix.
- Multi-tenant strategy.
- RLS strategy.
- Assessment lifecycle.
- Course / Course Offering / Group / Enrollment relationship.

## 4. Crear:

```text
docs/architecture.md
docs/domain-model.md
docs/database-schema.md
docs/authorization.md
docs/assessment-design.md
docs/roadmap.md
```

## 5. No implementar todavía todas las features.

Primero quiero revisar que la arquitectura sea sólida.

Una vez finalizada esta fase, continuar con Phase 1.

---

# 73. EXPECTED DOMAIN MODEL

Como punto de partida, espero algo conceptualmente parecido a:

```text
Organization
│
├── Organization Members
│      ├── Admin
│      ├── Professor
│      └── Student
│
├── Registration Links
│
├── Groups
│
├── Courses
│    │
│    ├── Professors
│    │
│    ├── Modules
│    │    │
│    │    ├── Dependencies
│    │    │
│    │    └── Lessons
│    │         │
│    │         └── Content Blocks
│    │
│    └── Assessments
│
└── Course Offerings
      │
      ├── Group
      │
      └── Enrollments
            │
            ├── Progress
            ├── Quiz Attempts
            └── Assessment Attempts
```

Validá este modelo y mejoralo si es necesario.

---

# 74. FINAL PRINCIPLE

Quiero que la plataforma sea:

> Simple para el estudiante.

> Potente para el profesor.

> Administrativamente completa para la organización.

> Segura entre organizaciones.

> Robusta durante evaluaciones masivas.

> Flexible para diferentes organizaciones deportivas.

> Fácil de mantener y evolucionar.

No sacrificar arquitectura y seguridad por velocidad de implementación.

Pero tampoco sobre-ingenierizar funcionalidades que no forman parte del MVP.

Cuando exista una decisión entre una solución sofisticada y una solución simple que cumple correctamente los requisitos, preferir la solución simple.

Siempre priorizar la experiencia real del estudiante y del profesor.