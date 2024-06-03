---
author: "ripx80"
title: "wg overhead reminder"
linktitle: "wg overhead reminder"
description: "wg header overhead and the connection problems with your cutted off mtu"
date: 2024-04-15
draft: false
tags:
  - network
  - security
  - nix
keywords:
  - network
  - security
  - nix
weight: 0
---

## short

## wg overhead

the overhead of wireguard breaks down as follows:

- 20-byte: ipv4 header or 40 byte ipv6 header
- 8-byte: udp header
- 4-byte: type
- 4-byte: key index
- 8-byte: nonce
- n-byte: encrypted data
- 16-byte: authentication tag

so, if you assume 1500 byte ethernet frames, the worst case (ipv6)
winds up being 1500-(40+8+4+4+8+16), leaving n=1420 bytes. if you use only ipv4 then n=1440 bytes.
but why i set a mtu size of **1380* bytes? i get some trouble with my ssh connection
 a size of 1500 bytes but my internet provider cut 40 bytes off on some routing instance.
wireguard has

## stabilize your wg connection
