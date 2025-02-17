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

# satisfactory

## container host

```sh
interfaces.br0.ipv4.addresses = [{
    address = "192.168.178.1";
    prefixLength = 24;
}];
 # container brdige
bridges.br0.interfaces = [];
```

## containers - port redirection

```sh
flush ruleset
define satisfactory_ports = { 15777, 15000, 7777 }
# redirect port to container (with his own ip stack, private network)
# ip here because the private network only has ipv4
table ip nat {
    chain prerouting {
        type nat hook prerouting priority -100; policy accept;
        iifname enp10s0 tcp dport 8080 counter dnat to 192.168.178.11
    }
    chain postrouting {
        type nat hook postrouting priority -100; policy accept;
        ip daddr 192.168.178.11 counter masquerade
    }
}


table inet routing {
    chain forward {
    # port forwarding
    iifname enp10s0 oif br0 tcp dport 8080 counter accept comment "internet to internal"
    iifname enp10s0 oif br0 udp dport $satisfactory_ports counter accept comment "internet to internal"

}
```

## containers - internet

```sh
table inet nat {
    chain postrouting {
        type nat hook postrouting priority 100; policy accept;
        iifname br0 oif enp10s0 counter masquerade comment "allow containers, vm connecting to the internet"
    }
}

table inet routing {
    chain forward {
        type filter hook forward priority 0; policy drop;
        ct state vmap { invalid : drop, established : accept, related : accept }

        # br0 (container, vm) allow internet access
        iifname br0 oif enp10s0 counter accept comment "routing to internet"
        iif enp10s0 oifname br0 ct state related,established counter accept comment "allow responses from internet"

        # port forwarding
        iifname enp10s0 oif br0 tcp dport 8080 counter accept comment "internet to internal"
        iifname enp10s0 oif br0 udp dport $satisfactory_ports counter accept comment "internet to internal"

    }
}
```

## learned

```sh
# show you the routing table to be used
$ ip route get 192.168.178.1 from 192.168.178.1

local 192.168.178.1 from 192.168.178.1 dev lo uid 1000
    cache <local>
```

- [socat](https://fossies.org/linux/socat/EXAMPLES), more options and no portability nightmare like netcat

## todo

```txt
    container:

    - set system.stateVersion
    - set nameserver
    - set defaultGateway
    - define a bridge br0 (192.168.178.1/24)
    - auto add ve|vb devices
    - /var/lib/satisfactory/.local/share/Steam/logs
        - bootstrap_log.txt
        - stderr.txt
    - /var/lib/satisfactory/SatisfactoryDedicatedServer/FactoryGame/Saved/Logs
        - FactoryGame.log
    - udp ports:
        15777 Query Port
        15000 Beacon Port
        7777 Game Port

    nixos-container root-login satisfactory
```
