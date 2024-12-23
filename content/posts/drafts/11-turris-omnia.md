---
author: "ripx80"
title: "Turris Omnia"
linktitle: "Turris Omnia"
description: ""
date: 2024-11-20
draft: true
tags:
  - network
  - security
keywords:
  - network
  - security
weight: 0
---

todo:

- vlans
- [x] wan: set mac to isp-cable
- [x] install host cert and ca, default ist turris.local cn
- [x] set led brightness, command not found led bug in [os6](https://gitlab.nic.cz/turris/os/packages/-/issues/857)
- [ ] can not set color, try to use direct the interface in sys

- [ ] 5ghz test 80 vs 160 MHz in all rooms
- [ ] 2.4 ghz test 20 vs 400 MHz in all rooms
- [ ] [grafana-agent](https://github.com/synaptiko/bigclown-influxdb-grafana-installation) export data or [this](https://grafana.com/docs/grafana-cloud/send-data/metrics/metrics-prometheus/prometheus-config-examples/dell-omnia/)
- [ ] add usb device to [store](https://wiki.turris.cz/en/public/mount_and_format_a_drive) files
- [ ] setup [wireguard](https://wiki.turris.cz/en/public/wireguard)
- [ ] setup nftables fw
- [ ] check ssh configuration, keys only, ciphers, aso
- [ ] login banner
- [ ] encryption? usb drive, remote unlock via ssh, initramfs?
- [ ] run containers?
- [ ] switch to my dns server
- [ ] check ntp time servers in germany
- [ ] disable unnessesary [software](https://wiki.turris.cz/en/public/updater) at boot -> delete from system
- [ ] [jDownloader](https://wiki.turris.cz/en/public/jdownloader_lxc), [pyLoad](https://wiki.turris.cz/en/public/pyload_lxc)

- [ ] add one lte-T or lte-V like [this](https://wiki.turris.cz/en/public/ltemodem-vodafone-k5150), hotplug
- [ ] add multi hop endpoints
- [ ] maybe redirect to local port via ssh: https://wiki.turris.cz/en/public/lighttpd
- [ ] try out: [netdata](https://wiki.turris.cz/en/public/netdata)
- [ ] use nextcloud
- [ ] use [ngnix](https://wiki.turris.cz/en/public/webserver) internaly?
- [ ] turn off wifi at [night](https://wiki.turris.cz/en/public/wifi_off_during_night)
- [ ] need a sperate ca for home-network?

## short

- system: armv7
- kernel: 5.15.64
- name: turris omnia wifi 6
- model rtrom02-FCC
- turris os: 6.0-alpha

## benefits

- opensource [firmware](https://gitlab.nic.cz/turris) and [hardware specs](https://docs.turris.cz/hw/omnia/omnia/)
- full access
- secure

## hardware

- cpu: marvel armada 385, dual-core 1.6 GHz
- ram: 2GB DDR3
- memory: 8GB eMMC
- 3x miniPCIe slots (one switch to mSata), 2x for wifi, 1x for lte module
- 2x uart
- 10x gpio slots
- SIM Card Slot
- 5x ethernet 1Gbits
- 1x ethernet 1Gbits WAN
- 1x SFP
- 2x USB 3.0
- 280x145x180mm, 1265g
- antenna: 4x 2,4 GHz/5Gz dBi omnidirectional
- energy consumption: 5W - 40W, 100-240V AC, 12V dc/3.3A, 40W max

- wifi card: AsiaRF AW7915-NP1 (wifi 6), 2.4/5 GHz, 23 dBm max, based on Mediatek MT7915AN
- wifi card: dnxa-97-h (wifi 4), 2.4 GHz, 19 dBm max, based on Qualcomm Atheros AR9287

addons

- [lte kit](https://docs.turris.cz/hw/omnia/add-ons/), modem chip Quectel EP06, category 6 optimized for M2M and IoT
  provide 300 Mb/s downlink and 50 Mb/s uplink speeds.

## setup

### vodafone connect box

Seriennummer: 1CJ4D51L9705688
Firmware-Version: AR01.04.137.07_060724_7249.SIP.20
Hardware-Typ & Version: 7
AFTR Adresse	2a02:908::1:4002
wan mac: c0:94:35:a2:1a:74
wan ipv6: 2a02:908:f000:b3::27e
wan ipv6 prefix delegation: 	2a02:8071:61d0:2fe0::/62
wan dns: 2a02:908:2:b::1,2a02:908:2:a::1

lan: 192.168.1.0/24
lan ip: 192.168.1.1/24
lan mac: 50:a5:dc:d2:36:24
lan ipv6: 	2a02:8071:61d0:2fe0::/64
lan dhcp: 192.168.1.100 - 253

fixed domain name: kabelbox.local

- disable wifi
-

### omnia

- isp-cable: 192.168.1.0/24
- isp-lte-v: 192.168.2.0/24
- isp-lte-t: 192.168.3.0/24
- home: 192.168.4.0/24

- firmware update
- disable cs and de language pack
- disable auto update

## wifi

5 GHz, 80MHz, n/ac/ax mode, channel 36 (5180 MHz), wpa3/wpa2 mixed mode
2.4 GHz, 40MHz, n/ac/ax mode, channel 1 (2412 MHz), wpa3/wpa2 mixed mode

guest network, 2.4, ip 10.111.222.1/24, lease 1 hour, QoS Down 1Mbits, Up 1Mbits

## pkgs

```sh
opkg update
opkg install nano # TERM=xterm
```

## enable self signed ca and server cert

```sh
# copy your ca.crt and server.crt to the router
cp fn.cert /etc/ssl/certs/
cat /etc/ssl/certs/fn.cert >> /etc/ssl/cert.pem

# /etc/lighttpd/conf.d/40-ssl-enable.conf
# ssl.pemfile = "/etc/lighttpd-self-signed.pem"
# need a bundle of key and cert
cat server.key server.crt > server.pem

cp server.pem /etc/lighttpd-self-signed.pem
/etc/init.d/lighttpd restart
```

## leds

```sh
/usr/bin/rainbow -l # list leds by name

# /etc/config/rainbow.
config led 'all'
        option brightness '010'
```

## lte internal modem

will be internally conncted via usb

```sh
lsusb
Bus 001 Device 002: ID 2c7c:0306 Quectel EP06-E

mmcli -m 0 # list modems, not detect sim, pause here
```

## lte usb modem

```sh
lsusb
Bus 003 Device 002: ID 0846:68e1 Netgear MR6X00


opkg install kmod-usb-net-cdc-ether kmod-usb-net-cdc-mbim kmod-usb-net-cdc-ncm kmod-usb-net-huawei-cdc-ncm umbim
```


## learned

- if sfp is connected wan port is disabled, internally one bus
- check: eth not support wol? ethtool -s eth0 wol g

## docs

- [turris doc](https://docs.turris.cz/)
- [turris omnia wifi6 manual (pdf)](https://static.turris.com/docs/omnia/omnia-manual-en.pdf)
- [turris omnia wifi6 datasheet](https://secure.nic.cz/files/Turris-web/Omnia/Turris_Omnia_4G_datasheet_EN.pdf)
- [turris omnia wifi6 schematics](https://static.turris.com/docs/omnia/CZ11NIC23-schematics.pdf)
- [Installation of LTE modem into Turris Omnia router](https://wiki.turris.cz/en/howto/lte_modem_install)
- [NixOS on Turris Omnia](https://gitlab.com/Cynerd/nixturris/-/blob/master/docs/install-omnia.adoc)
- [lets encrypt cert](https://wiki.turris.cz/en/public/letencrypt_turris_lighttpd)
- [led controls](https://wiki.turris.cz/en/howto/led_settings#:~:text=Setting%20the%20intensity,-You%20can%20set&text=The%20main%20means%20to%20set,starts%20at%20highest%20intensity%20again.)
