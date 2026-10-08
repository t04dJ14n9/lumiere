# Resources

Phase 3 core service. Each native panel owns a context with its own resource
channel and vault root. Files are resolved through the `VaultIndex` contract.
The snapshot resolver is temporary until Phase 5. File resources require both
URI containment and realpath containment; virtual symlinks are rejected.
