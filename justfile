# Justfile for Dotfiles using GNU Stow

set shell := ["bash", "-euo", "pipefail", "-c"]

target := env("HOME")

# All stow packages (explicit to avoid stowing non-package dirs)
packages := "fastfetch ghostty git nvim opencode starship zsh agents"

# Default recipe: show available commands
default:
    @just --list

# Restow all packages
[doc("Restow every package")]
all:
    @for pkg in {{ packages }}; do \
        echo "Restowing $pkg"; \
        stow --verbose --target={{ target }} --restow "$pkg"; \
    done

# Install (restow) one or more packages
[doc("Install packages: just install nvim git zsh")]
install +pkgs:
    @for pkg in {{ pkgs }}; do \
        if [ ! -d "$pkg" ]; then \
            echo "Error: Package '$pkg' does not exist"; \
            exit 1; \
        fi; \
        echo "Installing $pkg"; \
        stow --verbose --target={{ target }} --restow "$pkg"; \
    done

# Dry-run install to preview what would change
[doc("Preview install: just dry-run nvim")]
dry-run +pkgs:
    @for pkg in {{ pkgs }}; do \
        if [ ! -d "$pkg" ]; then \
            echo "Error: Package '$pkg' does not exist"; \
            exit 1; \
        fi; \
        echo "=== Dry-run: $pkg ==="; \
        stow --verbose --target={{ target }} --no --restow "$pkg" 2>&1 || true; \
    done

# Adopt existing files into stow packages then restow
[doc("Adopt existing files: just adopt nvim")]
adopt +pkgs:
    @for pkg in {{ pkgs }}; do \
        if [ ! -d "$pkg" ]; then \
            echo "Error: Package '$pkg' does not exist"; \
            exit 1; \
        fi; \
        echo "Adopting $pkg"; \
        stow --verbose --target={{ target }} --adopt "$pkg"; \
    done

# Delete all symlinks (with confirmation)
[doc("Remove all symlinks")]
[confirm("This will remove ALL symlinks. Continue? (y/n)")]
delete:
    @for pkg in {{ packages }}; do \
        echo "Deleting $pkg"; \
        stow --verbose --target={{ target }} --delete "$pkg"; \
    done

# Uninstall (unlink) one or more packages
[doc("Uninstall packages: just uninstall nvim git")]
uninstall +pkgs:
    @for pkg in {{ pkgs }}; do \
        if [ ! -d "$pkg" ]; then \
            echo "Error: Package '$pkg' does not exist"; \
            exit 1; \
        fi; \
        echo "Uninstalling $pkg"; \
        stow --verbose --target={{ target }} --delete "$pkg"; \
    done

# Scaffold a new stow package
[doc("Create new package: just init alacritty")]
init pkg:
    @if [ -d "{{ pkg }}" ]; then \
        echo "Error: Package '{{ pkg }}' already exists"; \
        exit 1; \
    fi
    mkdir -p "{{ pkg }}"
    @echo "Created package '{{ pkg }}/' — add your dotfiles then run: just install {{ pkg }}"
    @echo "Don't forget to add '{{ pkg }}' to the packages list in justfile"

# List all available packages
[doc("List available packages")]
list:
    @echo "Available packages:"
    @for pkg in {{ packages }}; do \
        echo "  - $pkg"; \
    done

# Show what would be stowed for each package (dry-run)
[doc("Dry-run: show what would be stowed")]
status:
    @echo "Package status (dry-run):"
    @for pkg in {{ packages }}; do \
        echo ""; \
        echo "Package: $pkg"; \
        stow --verbose --target={{ target }} --no "$pkg" 2>&1 || true; \
    done
