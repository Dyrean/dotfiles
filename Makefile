# Makefile for Dotfiles using GNU Stow

# Automatically get all package directories in the current folder
PACKAGES := $(wildcard */)

# Targets
.PHONY: all install uninstall clean list status

# 1. STOW ALL: Restows every package found
all:
	@for pkg in $(PACKAGES); do \
		echo "Restowing $$pkg"; \
		stow --verbose --target=$$HOME --restow $$pkg; \
	done

# 2. INSTALL SPECIFIC: Similar to "stow -t ~ foo"
# Usage: make install PKG=opencode
install:
	@if [ -z "$(PKG)" ]; then \
		echo "Error: Please specify a package (make install PKG=name)"; \
		exit 1; \
	fi
	@if [ ! -d "$(PKG)" ]; then \
		echo "Error: Package '$(PKG)' does not exist"; \
		exit 1; \
	fi
	stow --verbose --target=$$HOME --restow $(PKG)

# 3. DELETE ALL: Removes all symlinks
delete:
	@for pkg in $(PACKAGES); do \
		echo "Deleting $$pkg"; \
		stow --verbose --target=$$HOME --delete $$pkg; \
	done

# 4. DELETE SPECIFIC: Unlinks a single package
# Usage: make uninstall PKG=opencode
uninstall:
	@if [ -z "$(PKG)" ]; then \
		echo "Error: Please specify a package (make uninstall PKG=name)"; \
		exit 1; \
	fi
	@if [ ! -d "$(PKG)" ]; then \
		echo "Error: Package '$(PKG)' does not exist"; \
		exit 1; \
	fi
	stow --verbose --target=$$HOME --delete $(PKG)

# 5. LIST PACKAGES: Show all available packages
list:
	@echo "Available packages:"
	@for pkg in $(PACKAGES); do \
		echo "  - $$pkg"; \
	done

# 6. STATUS: Show what would be stowed for each package (dry-run)
status:
	@echo "Package status (dry-run):"
	@for pkg in $(PACKAGES); do \
		echo ""; \
		echo "Package: $$pkg"; \
		stow --verbose --target=$$HOME --no $$pkg 2>&1 || true; \
	done
