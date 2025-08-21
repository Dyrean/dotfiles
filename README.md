# 🖥️ My Dotfiles

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

My personal dotfiles for various tools and applications. These configurations are managed using [GNU Stow](https://www.gnu.org/software/stow/) for easy symlinking.

## 🛠️ Included Configurations

- **Shell**: Zsh configuration with plugins and customizations
- **Terminal**: Ghostty terminal configuration
- **Editor**: Neovim configuration with plugins
- **Version Control**: Git configuration and aliases
- **Prompt**: Starship prompt configuration
- **System Info**: Fastfetch configuration

## 🚀 Installation

### Prerequisites

- GNU Stow
- Git
- Zsh (optional, but recommended)

### Quick Start

1. Clone this repository to your home directory:
   ```bash
   git clone https://github.com/yourusername/dotfiles.git ~/dotfiles
   cd ~/dotfiles
   ```

2. Install the configurations using the provided Makefile:
   ```bash
   make install
   ```

   Or manually stow each configuration:
   ```bash
   stow zsh nvim git starship ghostty fastfetch
   ```

## 🔧 Customization

- Edit the respective configuration files in their directories
- New configurations can be added by creating a new directory and adding it to the stow command
- Use `.stow-local-ignore` to exclude files from being symlinked

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Thanks to all the open-source projects that make these configurations possible
- Inspired by various dotfiles repositories from the community
