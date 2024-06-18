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

when a network tunnel encapsulate your traffic you need extra size for the additional headers.
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

assuming a standard mtu size of 1500 bytes on ethernet frames the mtu for ipv4 is 1440 (1500-60) bytes and for ipv6 1420 (1500-80) bytes.
if your connection is stable if you set one of these sizes, you have no additional headers and your isp don't add additional headers like [gre](https://www.cloudflare.com/learning/network-layer/what-is-gre-tunneling/) for routing, you should fine.

but in my case i run into trouble. when i start my ssh connection from my homelab to one of the servers outside i have no stable connection.
sometimes wireguard not working, sometimes ssh not established a connection.
time to deep dive in.

## stabilize your wg connection

the first step was to check my ssh configuration for my server and for my client in my nixos module.
i figure out, that when i using a smaler bunch of KexAlgorithms and Public Key Accpeted Types the connection can be established.
i cutt off all unesecary (for me) options.
this is only a snipped of the complete configuration.

```sh
services.openssh = {
    settings = {
    KexAlgorithms = [
        "curve25519-sha256@libssh.org"
        "diffie-hellman-group-exchange-sha256"
    ];
    };

    extraConfig = ''
    PubkeyAcceptedKeyTypes ssh-ed25519-cert-v01@openssh.com,ssh-ed25519
    '';
};
programs.ssh = {
    # mozilla recomended
    # ssh-ed25519-cert-v01@openssh.com,ssh-rsa-cert-v01@openssh.com,ssh-ed25519,ssh-rsa,ecdsa-sha2-nistp521-cert-v01@openssh.com,ecdsa-sha2-nistp384-cert-v01@openssh.com,ecdsa-sha2-nistp256-cert-v01@openssh.com,ecdsa-sha2-nistp521,ecdsa-sha2-nistp384,ecdsa-sha2-nistp256
    hostKeyAlgorithms = [ "ssh-ed25519" "ssh-rsa" ];
    pubkeyAcceptedKeyTypes = [ "ssh-ed25519" ];
    knownHosts = cfg.knownHosts;
};
```

but this can not be the real problem because wireguard sometimes not established a stable connection.
next step was to traceroute the connection from my client to the server.

```sh
todo: example
tracepath
```

todo:

normaly should fragment

on some point my internet provider cut 40 bytes off on some routing instance. the gre protocol has only 24 bytes overhead, so this must be
something else. but at my point i can not figure out what my provider doing.
so i substract 40 bytes from potential ipv6 1420 bytes (1420 - 40 = 1380) and that this mtu size to my wireguard interface.

```sh
# set the mtu of wg0 interface to 1380
ip link set mtu 1380 dev wg0
```

- 1460 vs 1380
- how can i see if packets are fragmented?
- how can i see my isp used a gre header (24 bytes)
- normaly mtu should be the same on both sides

mtu calculation:
- transportation (1500 default) or messure
- Bei einem typischen DSL ist das normalerweise 1492, bei Cable (DOCSIS) 1500 Bytes.

- Normalerweise sollten zu große Pakete von der Tunnelsoftware fragmentiert werden. Allerdings kann das nicht jede Software. GRE und Wireguard können dies nicht, daher gehen Verbindungen mit großen Paketen innerhalb des Tunnel dann häufig kaputt und Seiten laden (teilweise) nicht.
- Heute wird aber so gut wie alles mit DF-Flag gesendet, daher gilt für IPv4 mittlerweile das gleiche, wie für IPv6 (dort gibt es ein solches Flag nicht, Pakete werden NIE von Routern fragmentiert)

todo:
- could it be [mss](https://www.cloudflare.com/learning/network-layer/what-is-mss/)

## test

must be messure both sides.

```sh
tracepath 8.8.8.8

```

- GRE-Tunnel geht: F=1448
- wg tunnel: F=1420
- MSS?
- PMTU?

## docs

- [header and mtu sizes for wireguard](https://lists.zx2c4.com/pipermail/wireguard/2017-December/002201.html)
- [mtu inside a tunnel](https://wiki.freifunk-franken.de/w/MTU), freifunk
- [test with iperf3](https://gist.github.com/nitred/f16850ca48c48c79bf422e90ee5b9d95)
- [wireguard protocol](https://www.wireguard.com/protocol/)
- [generic routing encapsulation - gre](https://en.wikipedia.org/wiki/Generic_Routing_Encapsulation)

## learned

- net.ipv4.icmp_errors_use_inbound_ifaddr = 1
- pmtu, path mtu discovery