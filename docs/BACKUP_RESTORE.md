# Backup and restore

- **Automatic backups** run on interval and on logout/shift close (see `electron/main/backup.ts`). The backup folder defaults to `D:/backup` unless `backup.path` is set in settings.
- **Manual backup:** Available from the shell / IPC `backup:run`.
- **Restore:** **استعادة** page lists `.db` copies. Before replace, the app runs `PRAGMA integrity_check` on the selected file; invalid files are rejected with an error (no restart).
- After a valid restore, the app relaunches with the copied database.

Always verify backups on a non-production machine when possible.
