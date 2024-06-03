---
author: "ripx80"
title: "wireguard mtu header overhead"
linktitle: "wireguard mtu header overhead"
description: "wireguard header overhead and the connection problems with your cutted off mtu"
date: 2024-06-03
draft: true
tags:
  - network
  - security
  - nix
  - wireguard
keywords:
  - network
  - security
  - nix
  - wireguard
  - mtu
weight: 0
---

## short

when the wireguard protocol is used the mtu size is reduced inside the tunnel.
this can be a problem when your isp cut off your mtu size and you use large packets like the ssh handshake inside a wireguard connection.
this results in a connection that sometimes work and sometimes not.
to enable a stable connection within wireguard and to avoid isp-related problems, the **mtu** should be set to **1380** bytes.

## wg overhead

the overhead of the wireguard header are 32 bytes.
additionaly to calculate the complete overhead the size of the ip and transprot protocol is needed.

- 20-byte: ipv4 header or 40 byte ipv6 header
- 8-byte: udp header
- 4-byte: type
- 4-byte: key index
- 8-byte: nonce
- 16-byte: authentication tag
- n-byte: encrypted data

when add this together with the underlying protocols you get the encapsulation overhead of a wireguard connection.

- 60 bytes with ipv4 (20+8+4+4+8+16)
- 80 bytes with ipv6 (40+8+4+4+8+16)

## mtu calculation

assuming a standard mtu size of 1500 bytes on ethernet frames the mtu for ipv4 is 1440 (1500-60) and for ipv6 1420 (1500-80).

(left here)

but why i set a mtu size of **1380* bytes? i get some trouble with my ssh connection
 a size of 1500 bytes but my internet provider cut 40 bytes off on some routing instance.
wireguard has


## stabilize your wg connection

```sh
# set the mtu of wg0 interface to 1380
ip link set mtu 1380 dev wg0
```

- 1460 vs 1380
- how can i see if packets are fragmented?
- how can i see my isp used a gre header
- normaly mtu should be the same on both sides

mtu calculation:
- transportation (1500 default) or messure
- Bei einem typischen DSL ist das normalerweise 1492, bei Cable (DOCSIS) 1500 Bytes.
- Dann muss man den Overhead von allem, was zwischen Transportweg und den "inneren" Paketen liegt abziehen. Beispiel Wireguard: - IPv4 (20 Bytes) oder IPv6 (40 Bytes) - UDP (8 Bytes) - Wireguard Overhead (32 Bytes)

- Normalerweise sollten zu große Pakete von der Tunnelsoftware fragmentiert werden. Allerdings kann das nicht jede Software. GRE und Wireguard können dies nicht, daher gehen Verbindungen mit großen Paketen innerhalb des Tunnel dann häufig kaputt und Seiten laden (teilweise) nicht.
- Heute wird aber so gut wie alles mit DF-Flag gesendet, daher gilt für IPv4 mittlerweile das gleiche, wie für IPv6 (dort gibt es ein solches Flag nicht, Pakete werden NIE von Routern fragmentiert)


## test

must be messure both sides.

```sh
tracepath 8.8.8.8

```

- GRE-Tunnel geht: F=1448
- wg tunnel: F=1420

## docs

- [header and mtu sizes for wireguard](https://lists.zx2c4.com/pipermail/wireguard/2017-December/002201.html)
- [mtu inside a tunnel](https://wiki.freifunk-franken.de/w/MTU), freifunk
- [test with iperf3](https://gist.github.com/nitred/f16850ca48c48c79bf422e90ee5b9d95)
- [wireguard protocol](https://www.wireguard.com/protocol/)
- [generic routing encapsulation - gre](https://en.wikipedia.org/wiki/Generic_Routing_Encapsulation)

## learned

- net.ipv4.icmp_errors_use_inbound_ifaddr = 1
- pmtu, path mtu discovery