#!/bin/bash
# IONOS 4 GB RAM: 4 GB Swap-File anlegen (Ubuntu/Debian).
# Idempotent: läuft 2× ohne Fehler.
set -e

if swapon --show | grep -q swapfile; then
  echo "Swap already active:"
  swapon --show
  exit 0
fi

echo "Creating 4G swap file at /swapfile …"
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

if ! grep -q "/swapfile" /etc/fstab; then
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# Niedrige swappiness — wir wollen nur unter echter Last in den Swap.
sudo sysctl -w vm.swappiness=10
if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
  echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
fi

echo "Swap setup complete:"
swapon --show
free -h
