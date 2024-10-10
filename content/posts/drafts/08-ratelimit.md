---
author: "ripx80"
title: "traffic control and rate limiting"
linktitle: "traffic control and rate limitingr"
description: "traffic control and rate limiting with tc, nftables and iproute2"
date: 2024-06-03
draft: true
tags:
  - network
  - security
  - nftables
  - nix
keywords:
  - network
  - security
  - nftables
  - nix
weight: 0
---

## short

- system: x86_64
- kernel: 6.7.9
- nixos: 23.11
- nftables: 1.0.9
- iproute2
- tc
- bc

- <https://www.suse.com/c/iproute2-traffic-control/#Putting%20it%20all%20together>
- <http://lartc.org/howto>

## short

## overview

you need root access

```sh
tc qdisc show                       # list qdisc rules
tc qdisc show dev enp10s0           # only for enp10s0
tc -s qdisc                         # statistics

tc qdisc del dev eth0 root netem    # remove a rule



tc filter show dev enp10s0          # show filters

tc qdisc del dev enp10s0 root          # cleanup
tc qdisc del dev enp10s0 parent 1:3 # delete

tc qdisc change dev eth0 handle 30: netem loss 0.1%
tc qdisc change dev eth0 handle 30: netem duplicate 1%
tc qdisc change dev eth0 handle 30: netem corrupt 0.1%
```

## checks

```sh
modinfo sch_netem # check if netem is available
```

## delay

Add delay 1000+-10ms to all packets to box 10.0.0.2

```sh
tc qdisc add dev enp10s0 root handle 1: prio
tc qdisc add dev enp10s0 parent 1:3 handle 30: netem delay 1000ms 10ms  distribution normal
tc filter add dev enp10s0 protocol ip parent 1:0 prio 3 u32 match ip dst 10.0.0.2/32 flowid 1:3
```

## inject latency

you need the kernel module sch_netem

```sh
modprobe sch_netem # load module
tc qdisc change dev eth0 handle 30: netem loss 0.1%
tc qdisc change dev eth0 handle 30: netem duplicate 1%
tc qdisc change dev eth0 handle 30: netem corrupt 0.1%
```

## network device mirroring

- you need iproute2
- enp10s0 is the interface you want to copy
- dummy0 is the virtual interface

```sh
ip link add dummy0 type dummy # add virtual dummy interface
# ingress
tc qdisc add dev enp10s0 ingress # ingress qdisc
tc filter add dev enp10s0 parent ffff: protocol all u32 match u8 0 0 action mirred egress mirror dev dummy0 # add filter ingress mirror
tc -s -p filter ls dev enp10s0 parent ffff # check ingress rule

# egress
tc qdisc add dev enp10s0 parent root handle 1: prio
tc filter add dev enp10s0 protocol all parent 1: u32 match u8 0 0 action mirred ingress mirror dev dummy0

# or: test syntax
tc qdisc add dev eth0 handle 1: root prio
tc filter add dev enp10s0 parent 1: protocol all u32 match u32 0 0 action mirred egress mirror dev dummy0
tc -s -p filter ls dev enp10s0 parent 1: # check egress

# bring interface up
ip link set up dummy0 # set device up
```

- tc: traffic control
- qdisc: stands for *queueing discipline*. it manages traffic queuing on a network interface, determining how packets are handled.
- ingress: refers to incoming traffic. ingress queuing disciplines allow control and filtering of **inbound** packets.
- filter: a rule applied to traffic that specifies which packets to act upon based on defined conditions.
- parent ffff: Special identifier (`ffff:`) that refers to the ingress queue on an interface, used to handle incoming traffic.
- protocol all: The filter applies to all network protocols (IPv4, IPv6, ARP, etc.).
- u32 match u8 0 0: A flexible packet classifier (`u32`), examining 8-bit data (`u8`). The mask `0 0` matches all packets.
- action mirred egres mirror: mirred` stands for *Mirror/Redirect*. It mirrors outgoing traffic to a specified interface.

egress:

- default root egress qdisc
- Egress qdiscs use queuing algorithms to shape traffic. We will use the PRIO algorithm because it does not shape the traffic in any way — we certainly don’t want to disrupt our host traffic when we mirror it.

### only icmp

```sh
tc filter add dev enp10s0 parent ffff: protocol ip u32 match ip protocol 1 0xff action mirred egress mirror dev dummy0
tc filter del dev enp10s0 parent ffff: # del
```

- IP protocol 1 (ICMP)
- 0xff is the protocol mask and you can use it like a netmask to ignore certain bits when making a bitwise comparison.

### only ssh traffic

```sh
tc filter add dev enp10s0 parent ffff: protocol ip u32 match ip protocol 6 0xff ip dport 22 0xffff action mirred egress mirror dev dummy0
tc filter del dev enp10s0 parent ffff: # del
```

### icmp tcp and udp: prevent loops

- if you have only one interface, exclude gre

```sh
tc filter add dev enp10s0 parent ffff: protocol ip u32 match ip protocol 1 0xff action mirred egress mirror dev dummy0
tc filter add dev enp10s0 parent ffff: protocol ip u32 match ip protocol 6 0xff action mirred egress mirror dev dummy0
tc filter add dev enp10s0 parent ffff: protocol ip u32 match ip protocol 17 0xff action mirred egress mirror dev dummy0
```

## check

```sh
tcpdump -n -i dummy0 icmp
```

```sh
ping ripx80.de
```

```txt
12:22:24.835297 IP 142.250.184.195 > 192.168.1.2: ICMP echo reply, id 4, seq 1, length 64
```

```txt
12:23:18.246422 IP 192.168.1.2 > 142.250.184.195: ICMP echo request, id 5, seq 1, length 64
12:23:18.259691 IP 142.250.184.195 > 192.168.1.2: ICMP echo reply, id 5, seq 1, length 64
```

## cleanup

```sh
tc filter del dev enp10s0 protocol all parent ffff: # delete filter rule
tc qdisc del dev eth0 ingress                       # delte qdisc ingress
```

## shipping with gre

todo: split up in extra article about gre

- <https://david-waiting.medium.com/a-beginners-guide-to-generic-routing-encapsulation-fb2b4fb63abb> (gre tunnel)
- <https://medium.com/swlh/traffic-mirroring-with-linux-tc-df4d36116119> (shipping traffic)

```sh
ip link add tun0 type gretap remote 10.131.73.16 local 10.131.73.9 dev eth1
ip addr add 172.18.0.1/24 dev tun0 # not strictly necessary, only for debug
ip link set tun0 up
```

- be careful when only one nic is in/out, because it can be end in a traffic loop.
- Apart from the danger of loops, there is another serious drawback to using the capture interface to host the tunnel: you will not be able to increase the MTU of the tunnel interface independently of the capture interface. Therefore, any packets that are close to the MTU size cannot be mirrored because once the GRE and encapsulating IP headers are added, the tunneled packet will exceed the MTU and it will be dropped. Therefore, it is highly recommend having a second network interface to host the tunnel with an MTU that exceeds that of the capture interface by at least 38 bytes to cater for the tunnel overhead.

## rate limiting (todo test)

```sh
tc qdisc add dev eth0 root handle 1: htb default 30         # create qdisc
tc class add dev eth0 parent 1: classid 1:1 htb rate 1mbit  # create a class
tc filter add dev eth0 protocol ip parent 1:0 prio 1 u32 match ip src 0.0.0.0/0 flowid 1:1 # create a filter
```

## priority traffic (todo test)

- piority?
- different matchers? u32?
- algo prio?
- general structure of tc?

```sh
tc qdisc add dev eth0 root handle 1: htb # create qdisc
tc class add dev eth0 parent 1: classid 1:1 htb rate 2mbit ceil 2mbit # create class, 1:1 high priority
tc class add dev eth0 parent 1: classid 1:2 htb rate 1mbit ceil 1mbit # create class
tc filter add dev eth0 protocol ip parent 1: prio 1 u32 match ip sport 80 flowid 1:1 # add filter, matched soruce port: http
tc filter add dev eth0 protocol ip parent 1: prio 2 u32 match ip sport 8080 flowid 1:2 # add filter
```

## traffic policy

todo

```sh
tc qdisc add dev eth0 root handle 1: tbf rate 1mbit burst 32kbit latency 50ms
tc filter add dev eth0 protocol ip parent 1: prio 1 u32 match ip src 0.0.0.0/0 police rate 1mbit burst 32kbit drop
```
