---
author: "ripx80"
title: "wireguard mtu calculation"
linktitle: "wireguard mtu calculation"
description: "wireguard header overhead and the connection problems with your cutted off mtu by your isp"
date: 2024-06-27
draft: false
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

add this together with the underlying protocols you get the encapsulation overhead of a wireguard connection.

- 60 bytes with ipv4 (20+8+4+4+8+16)
- 80 bytes with ipv6 (40+8+4+4+8+16)

## mtu calculation

assuming a standard mtu size of 1500 bytes on ethernet frames the mtu for ipv4 is 1440 (1500-60) bytes and for ipv6 1420 (1500-80) bytes.
if your connection is stable if you set one of these sizes, you have no additional headers and your isp don't add additional headers like [gre](https://www.cloudflare.com/learning/network-layer/what-is-gre-tunneling/) for routing, you should fine.

but in my case i run into trouble. when i start my ssh connection from my homelab through the wg tunnel to one of the servers and use it as a jump host i have no stable connection. You guess it, tunnel in tunnel with ssh handshake.
sometimes wireguard not working, sometimes ssh not established a connection.
time to deep dive in.

## stabilize your wg connection

the first step was to check my ssh configuration for my server and for my client in my nixos module.
i figure out, that when i using a smaler bunch of **KexAlgorithms** and **PublicKeyAccpetedTypes** the connection can be established.
i cut off all unesecary (for me) options.
this is only a snipped of the complete ssh configuration.

```sh
# server
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
# client
programs.ssh = {
    # mozilla recomended
    # ssh-ed25519-cert-v01@openssh.com,ssh-rsa-cert-v01@openssh.com,ssh-ed25519,ssh-rsa,ecdsa-sha2-nistp521-cert-v01@openssh.com,ecdsa-sha2-nistp384-cert-v01@openssh.com,ecdsa-sha2-nistp256-cert-v01@openssh.com,ecdsa-sha2-nistp521,ecdsa-sha2-nistp384,ecdsa-sha2-nistp256
    hostKeyAlgorithms = [ "ssh-ed25519" "ssh-rsa" ];
    pubkeyAcceptedKeyTypes = [ "ssh-ed25519" ];
    knownHosts = cfg.knownHosts;
};
```

but this can not be the real problem because wireguard sometimes not established a stable connection no matter if i use ssh or not. next step was to check the connection from my client to the server.
first i check my routing path to my server from my interface connected to the internet.

```sh
tracepath <public server ip>

1?: [LOCALHOST]                      pmtu 1500
1:  _gateway                                              1.351ms
1:  _gateway                                              0.914ms
2:  _gateway                                              1.514ms pmtu 1460 # magic happens here
2:  no reply
3:  <gw ip>                                              15.359ms asymm  5
4:  <gw ip>                                              12.878ms
5:  <gw ip>                                              15.886ms
```

and from my server to my public ip of my homelab, because you must messure the mtu from both sides.

```sh
tracepath <public ipv4>
 1?: [LOCALHOST]                      pmtu 1500
 1:  <gw server hoster>                                    0.763ms
 1:  <gw server hoster>                                   10.803ms
 2:  <gw ip>                                               0.440ms
 3:  <gw ip>                                               3.917ms
 4:  <isp gw ip>                                           4.716ms asymm  5
 5:  no reply
 6:  <isp gw ip>                                           4.105ms pmtu 1460 # magic happens again
```

the gateway hop number 2 (first) and hop number 6 (second) reduced the pmtu (path mtu discovery) to 1460 bytes!
on some point my internet provider cut 40 bytes off on some routing instance.

but how does a reduction in mtu of 40 bytes come about?
my first guess was a additional gre header but the protocol has only 24 bytes overhead, so this must be something else.
after some research i find out that my provider use [DS-Lite](https://www.rfc-editor.org/rfc/rfc6333) (Dual Stack Lite) a tunnel protocol to carry ipv4 over a ipv6 network.

after a look into the [rfc](https://www.rfc-editor.org/rfc/rfc6333#section-5.3) things get clear.

>"Using an encapsulation (IPv4-in-IPv6 or anything else) to carry IPv4
   traffic over IPv6 will reduce the effective MTU of the datagram.
   Unfortunately, path MTU discovery [RFC1191] is not a reliable method
   to deal with this problem."...
>"A solution to deal with this problem is for the service provider to
   increase the MTU size of all the links between the B4 element and the
   AFTR elements by at least 40 bytes to accommodate both the IPv6
   encapsulation header and the IPv4 datagram without fragmenting the
   IPv6 packet."

with this enlightening insight we can adding the ipv6 header size to the prevoius calculation.
so i substract 40 bytes from potential ipv6 1420 bytes (1420 - 40 = 1380) and get the mtu size to my wireguard interface with ds-lite.

```sh
# set the mtu of wg0 interface to 1380
ip link set mtu 1380 dev wg0
```

remember, mtu should be the same on both sides so do this configuration on your local wg interface and your wg interface on the other endpoint, in my case my server.

if you are using nixos, you can set the mtu size in your wireguard configuration like this.

```sh
wireguard.enable = true;
    wireguard.interfaces = {
      wg0 = {
        ips = [ #<wg ip> ];
        privateKeyFile = # <wg key file>;
        listenPort = #<port number>;
        peers = [
          # <your peers>
        ];
        mtu = 1380;
      };
    };

```

now i have this configuration about some month and everything runs smoothly.
i hope it helps you if you have some problems to calculate your mtu for your specific environment.

## docs

- [header and mtu sizes for wireguard](https://lists.zx2c4.com/pipermail/wireguard/2017-December/002201.html)
- [mtu inside a tunnel](https://wiki.freifunk-franken.de/w/MTU), freifunk
- [test with iperf3](https://gist.github.com/nitred/f16850ca48c48c79bf422e90ee5b9d95)
- [wireguard protocol](https://www.wireguard.com/protocol/)
- [generic routing encapsulation - gre](https://en.wikipedia.org/wiki/Generic_Routing_Encapsulation)
- [dual stack lite](https://www.elektronik-kompendium.de/sites/net/2010211.htm)
- [dslite rfc633](https://www.rfc-editor.org/rfc/rfc6333)
- [dslite rfc6908](https://www.rfc-editor.org/rfc/rfc6908)
- [mss](https://www.cloudflare.com/learning/network-layer/what-is-mss/)

## learned

- net.ipv4.icmp_errors_use_inbound_ifaddr = 1
- pmtu, path mtu discovery
- Today, however, almost everything is sent with a DF flag, so the same now applies to IPv4 as to IPv6 (there is no such flag, packets are NEVER fragmented by routers)
