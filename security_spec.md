# Especificación de Seguridad — Después del adiós

## 1. Invariantes de datos
1. Cada caso (`/cases/{caseId}`) pertenece a un único titular (`ownerId`) inmutable. Ningún usuario puede crear un caso asignando otro `ownerId`.
2. La lectura y listado de casos (`/cases`) está restringida estrictamente al titular, los familiares incluidos en `memberUids` (máximo 15 miembros) y la cuenta administradora verificada (`edutom3@gmail.com`).
3. Solo el titular o un familiar con permiso `collaborate` (incluido en `collaboratorUids`) puede marcar trámites como hechos, actualizar documentos reunidos, subir copias o publicar notas compartidas. Los usuarios con permiso `view` tienen acceso estrictamente de solo lectura.
4. Ningún usuario ajeno puede unirse a un caso sin conocer un código de invitación (`inviteCode`) activo en `/invitations/{inviteCode}` cuyo `caseId` coincida y que pase de `pending` a `accepted` de forma atómica.
5. El catálogo de trámites (`/procedures`), los códigos de entidades colaboradoras (`/partnerCodes`), los avisos de cambios legales (`/legalAlerts`) y el directorio (`/professionals`) solo pueden ser creados, editados o eliminados por la administración verificada (`email_verified == true` y correo administrador). Los usuarios solo pueden canjear un código de entidad válido por su ID exacto sin poder listar todos los códigos existentes.
6. Todos los campos de texto tienen longitud máxima acotada y todos los identificadores de documento pasan validación `isValidId()`.

## 2. Payloads de prueba ("Dirty Dozen")
1. Crear caso con `ownerId` suplantado (`ownerId != request.auth.uid`) -> `PERMISSION_DENIED`.
2. Crear caso ya desbloqueado por usuario normal (`unlocked: true` sin pago/código) -> `PERMISSION_DENIED`.
3. Listar todos los casos sin filtrar por `memberUids` / `ownerId` -> `PERMISSION_DENIED`.
4. Añadir campo oculto (`isAdmin: true`) al crear o actualizar un perfil o caso -> `PERMISSION_DENIED`.
5. Familiar con permiso `view` intenta actualizar `taskStates` o `docStates` -> `PERMISSION_DENIED`.
6. Familiar con permiso `collaborate` intenta cambiar `ownerId` o `unlocked` -> `PERMISSION_DENIED`.
7. Usuario autenticado con `email_verified: false` reclamando correo administrador -> `PERMISSION_DENIED`.
8. Usuario no administrador intenta listar `/partnerCodes` -> `PERMISSION_DENIED`.
9. Usuario no administrador intenta crear o modificar un trámite en `/procedures` -> `PERMISSION_DENIED`.
10. Usuario no administrador intenta publicar una alerta en `/legalAlerts` -> `PERMISSION_DENIED`.
11. Inyección de identificador malicioso de >128 caracteres o con `/` en `caseId` -> `PERMISSION_DENIED`.
12. Usuario intenta añadirse a `memberUids` de un caso sin una invitación `pending` válida -> `PERMISSION_DENIED`.
