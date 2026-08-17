-- Runs once, when the dev container's data volume is first created.
--
-- The application schema itself is owned by Prisma migrations, not by this
-- directory. All this does is give `prisma migrate dev` the scratch database it
-- needs, so that the app's user never requires CREATE DATABASE rights.
CREATE DATABASE IF NOT EXISTS habit_tracker_shadow;
GRANT ALL PRIVILEGES ON habit_tracker_shadow.* TO 'habit'@'%';
FLUSH PRIVILEGES;
