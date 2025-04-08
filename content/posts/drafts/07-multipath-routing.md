---
author: "ripx80"
title: "Nixos Multipath Routing"
linktitle: "Nixos Multipath Routing"
description: ""
date: 2022-03-11T12:44:45+01:00
draft: true
tags:
  - nix
  - network
  - linux
weight: 0
---

todo:

split up in three parts:
    - part-1: general routing on linux systems
    - part-2: multipath routing
    - part-3: multipath routing on nixos

- switch to nftables
- graph which table will be selected by rules
- use a simple use case:
  - ping localhost
  - ping host in local network
  - ping host in external network
  - ping host which have a special rule
  - ping host which has an fwmark

## introduction

long things **short**:

## story

## conclusion

Technically, a router is to be built here, which has several internet uplinks. Two of them run via an LTE router and one via the fixed network connection.
In order to make the best possible use of all three, it should be possible to distribute the individual sessions over all uplinks via multipath routing.

Since we are often on the road and need the mobile LTE routers on our business trips, they should be able to be used via plug and play.
Since I don't want to do without NixOS anymore, this should all be implemented via a declerative approach.

NixOS not suppot multipath routing per default, so I add some systemd services that help out.
For normal propouses I use the default firewall from nixos but in this case I want a clear setup under my control.

## the routing story

normaly you have one default route in your system for most users this is the home router or the next gateway in your buisness network.
this default gateway know "normally" everything, where your traffic should go through.

```sh
$> ip route

default via 192.168.1.1 dev eth0 proto static
```

this means that all your traffic go over the interface eth0 to the ip address 192.168.1.1 which is the ip of your router.
but you have an extra entry for your local network. When you look at your ```ip route``` output you can see this:

```sh
192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.2
```

this is your route to the local network from your network card with the ip address 192.168.1.2. This will be used if you want to reach your default gateway.

TODO:

- explain proto kernel scope link src
- explain proto static

### route selection

In the common case, route selection is based completely on the destination address: local network and default gateway.
the followed selection will be used:

1. **lookup in the routing cache**

   The kernel searches for a matching entry for the destination first in the routing cache). also known as the forwarding information base (FIB).
   this will be used in kernel <= 3.6.

2. **lookup in the routing table (main routing table)**
3. **lookup longest prefix match**

    In practical terms, the concept of longest prefix match means that the most specific route to the destination will be chosen.

### routing cache

the [routing cache](http://linux-ip.net/html/routing-cache.html) is a simple hash table.
manipulating the routing tables may not have an immediate effect on the kernel's choice of path for a given packet because we have seen before that in first case we will look in this cache and jump back if we found an entry.

if we have change something in our routing we should flush the routing cache with:

```sh
$> ip route flush cache
$> ip route show cache
```

now we have no entries in the routing cache and the new config will be looked up and puts into the cache.

{{< garry "you can always use simple commands to get this information" info>}}

```sh
 cat /proc/net/rt_cache
```

as an attentive reader you will immediately notice that you have no entries in your cache if you used a actual linux kernel. yes, i was wondering to read this step in a lot of howtos but my cache was never filled up.

the ipv4 route cache was [removed](https://git.kernel.org/pub/scm/linux/kernel/git/netdev/net-next.git/commit/?id=89aef8921bfbac22f00e04f8450f6e447db13e42) from kernel 3.6.

you should be able to find any routing exceptions in the [FIB trie](https://www.kernel.org/doc/Documentation/networking/fib_trie.txt)

```sh
cat /proc/net/fib_trie
```

so new kernels don't use the routing cache.

## plolicy based routing (TODO)

policy based routing through the use of multiple routing tables and the routing policy database [RPDB](http://linux-ip.net/html/routing-rpdb.html).

selectors:

- src address
- ToS flags (Type of Service,  second byte in ip-header)
- fwmark (a mark carried through the kernel in the data structure representing the packet)
- inbound interface (on which the packet was received)

### priorities and rules

when the kernel choose a route for your packet it will be choosen by priority through the routing policy database with the priority of the following selectors:

  route cache | RPDB | route Table
------- | ---------------- | ----------:
 destination | source | destination
 source | destination | ToS
 ToS | ToS | scope
 fwmark | fwmark | oif
 iif| iif | -

If no matching entry is found in the specified routing table, the kernel will pass to the next rule in the RPDB, until it finds a match or falls through the end of the RPDB and all consulted routing tables.

then you have rules for each routing table. to look at these rules you can type:

```sh
$> ip rule show

0:      from all lookup local
32766:  from all lookup main
32767:  from all lookup default
```

- rule 0: This rule, created at RPDB initialization, instructs the kernel to try to find a match for the destination in the local routing table.

- rule 32766: the kernel will perform a route lookup in the main routing table (normaly contain a default route)

- rule 32767: Failing a route lookup in the main routing table the final rule instructs the kernel to perform a route lookup in table 253.

## tables

- multiple routing tables, common tables are local:255 and main:254
- max additional 252 tables (plus local, main, default)
- on top of policy routing
- keyed primarily to destination address (see priority)
- unique integer slots between 0 and 255

For practical purposes, this means that (even) a single routing table can contain multiple routes to the same destination if the ToS differs on each route or if the route applies to a different interface
The ip route and ip rule commands have built in support for the special tables main and local. Any other routing tables can be referred to by number or an administratively maintained mapping file, /etc/iproute2/rt_tables.

The file /etc/iproute2/rt_tables need not exist, as the iproute2 tools have a hard-coded entry for the local table.

- local: special routing table maintained by the kernel. entries can be removed, altered but not added, used for broadcast address, localhost ip, nat
- main: will be used by commands like **route** and **ip route**
- default: special?
- unspec: ?? not available

you can take a look at the **local** table:

```sh
$> ip route show table local
```

ip addr and ifconfig will cause the kernel to alter the local routing table and main

if you want to clear a routing table you can do this with :

```sh
ip route flush table main
```

### route types (TODO)

[doc](http://linux-ip.net/html/routing-rpdb.html#list-routing-rule-types)

- unicast (default type)
- broadcast
- local
- nat
- unreachable
- prohibit
- blackhole
- throw

TODO: part II, split this up

## multiple internet connections

- [multiple-links](https://lartc.org/howto/lartc.rpdb.multiple-links.html)
- [multi-internet-outbound-ip-routing](http://linux-ip.net/html/-adv-multi-internet.html#ex-adv-multi-internet-outbound-ip-routing)
- [dead gateway detection](http://ja.ssi.bg/#routes ):  Julian Anastasov

- outbound traffic only
- type of outbound service

I will use multipath default routes to split traffic arbitrarily across multiple ISPs for reasons like failover and to accommodate greater aggregate bandwidth than would be available on a single uplink.

### seperate traffic in two groups by source IP

- copy main routing table to new one and set alternate default route
- Use iptables/ipchains to mark traffic with fwmark
- Add a rule to the routing policy database.

```sh
# create new table 4
ip route flush table 4
# copy main table
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 4 $ROUTE; done

# set default gw
ip route add table 4 default via 192.168.1.1
# verify
ip route show table 4
```

now mark packages with iptables, only if you will seperate per service

```sh
iptables -t mangle -A PREROUTING -p tcp --dport 80 -s 192.168.99.0/24 -j MARK --set-mark 4 # http
iptables -t mangle -A PREROUTING -p tcp --dport 443 -s 192.168.99.0/24 -j MARK --set-mark 4 # https
iptables -t mangle -nvL # verify
```

All traffic comes from 192.168.99.0/24 and has as destinaion port 80 or 443 will mark with 4
With these iptables lines we have instructed netfilter to mark packets comes from 192.168.99.0/24 and has a destinaion port 80 or 443 with the fwmark 4.

**fwmark**: fwmark added to a packet is only valid and discernible while the packet is still on the host running the packet filter. The fwmark is stored in a data structure the kernel uses to track the packet. Because the fwmark is not a part of the packet itself, the fwmark is lost as soon as the packet has left the local machine.
A convention I find sensible is to use the same number for a routing table and fwmark where possible.

```sh
iptables -t nat -A POSTROUTING -o eth4 -j SNAT --to-source 67.17.28.12
iptables -t nat -A POSTROUTING -o eth1 -j SNAT --to-source 205.254.211.179
```

prepared the NAT rules so that our outbound packets will originate from the correct IPs

```sh
ip rule add fwmark 4 table 4
ip rule show
ip route flush cache
```

At the end set the mark to the defined table. Now marked packages goes to the default gw set in table 4.

### multipath default routes

- split outgoing traffic over multiple internet providers
- Setup for three internet outbound connections and one wifi ap.
- you must add tables to  /etc/iproute2/rt_tables or you get the following error:

```text
Error: argument "lte2" is wrong: table id value is invalid
```

#### Internal home network

```txt
ap0: (bridge: enp2s0:home.local, wlp5s0:wifi-home.local), ifip:192.168.2.1
```

### Outbound Internet connections

```txt
enp2s0:    wire-isp: 192.168.1.1, ifip: 192.168.1.80
enp0s20u1: lte-1: 192.168.3.1, ifip: 192.168.3.2
enp0s20u2: lte-2: 192.168.4.1, ifip: 192.168.4.2
```

First step, route all traffic from source 192.168.2.0 to one service provider 192.168.4.1:

```sh
###### test: route traffic from ap0 to different default gw over enp0s20u2
# add in rt_table: 4 lte-2
# setup tables copy from main and add default gw
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 4 $ROUTE; done
ip route add default via 192.168.4.1 table lte-2
# routing traffic
ip rule add fwmark 4 table 4
iptables -t mangle -A PREROUTING -s 192.168.2.0/24 -j MARK --set-mark 4
iptables -t nat -A POSTROUTING -o enp0s20u2 -j SNAT --to-source 192.168.4.2
# clear cache
ip route flush cache
#####
```

if you not know your external ip then you can use masquerade instead of the snat line:
iptables -t nat -A POSTROUTING -o enp0s20u2 -j MASQUERADE

```sh
# generate for each interface a table. copy from main and add default gw

# wire-isp
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 1 $ROUTE; done
# ip route add 127.0.0.0/8 dev lo table wire-isp #needed?
ip route add default via 192.168.1.1 table wire-isp
ip rule add from 192.168.1.80 table wire-isp # can be main table?

# lte-1
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 3 $ROUTE; done
# ip route add 127.0.0.0/8 dev lo table lte-1 #needed?
ip route add default via 192.168.3.1 table lte-1
ip rule add from 192.168.3.2 table lte-1

# lte-2
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 4 $ROUTE; done
# ip route add 127.0.0.0/8 dev lo table lte-2 #needed?
ip route add default via 192.168.4.1 table lte-2
ip rule add from 192.168.4.2 table lte-2 # must be 192.168.4.0/24?

# enable load-balancing or use
ip route del default

ip route add default scope global nexthop via 192.168.1.1 dev enp1s0 weight 1 \
   nexthop via 192.168.3.1 dev enp0s20u1 weight 1 \
   nexthop via 192.168.4.1 dev enp0s20u2 weight 1

# need to add mark on each package from each interface and use the table
# multipath will be flow-based not packet based per default [kernel 4.4 ](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=07355737a8badd951e6b72aa8609a2d6eed0a7e7)
# Failover with Pingu?
```

You only need these rules if your FORWARD chain and INPUT chain has as default policy DROP. The Default of these chains are ACCEPT.

```sh
iptables -A FORWARD -i ap0 -o enp0s20u2 -j ACCEPT
iptables -A FORWARD -i enp0s20u2 -o ap0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

#internal routing wg0 to wg0
# -A FORWARD -s 192.168.100.0/24 -d 192.168.100.0/24 -i wg0 -o wg0 -m conntrack --ctstate NEW,RELATED,ESTABLISHED -j ACCEPT
```

## Links (Todo)

- https://lartc.org/howto/lartc.rpdb.multiple-links.html
- https://lartc.org/howto/lartc.loadshare.html
- http://linux-ip.net/html/

- https://mlvpn.readthedocs.io/en/latest/linux_example.html
- https://logs.nix.samueldr.com/nixos-on-your-router/2021-01-05
- https://www.thomas-krenn.com/de/wiki/Zwei_Default_Gateways_in_einem_System
- https://nixos.wiki/wiki/Wpa_supplicant
- https://labs.quansight.org/blog/2020/07/nixos-rpi-wifi-router/
- https://francis.begyn.be/blog/nixos-home-router
- https://codecave.cc/multipath-routing-in-linux-part-1.html#:~:text=With%20multipath%20routing%20you%20can,%E2%86%92interface%20association%20or%20both)
- https://serverfault.com/questions/696675/multipath-routing-in-post-3-6-kernels
- https://www.linux-magazin.de/ausgaben/2015/06/fault-tolerant-router/2/
- https://lukecyca.com/2004/howto-multirouting-with-linux.html
- https://patchwork.ozlabs.org/project/netdev/patch/1459463081-20206-1-git-send-email-dsa@cumulusnetworks.com/

## unsorted info (maybe doupl)

# Linux routing

[doc](http://linux-ip.net/html/routing-selection.html)

## common case

In the common case, route selection is based completely on the destination address.
local network and default gateway

- lookup in the routing cache (aka. forwarding information base (FIB). The kernel searches for a matching entry for the destination first in the routing cache)
- lookup in the routing table (main routing table)
- lookup longest prefix match (In practical terms, the concept of longest prefix match means that the most specific route to the destination will be chosen.)

## cache

the [routing cache](http://linux-ip.net/html/routing-cache.html) is a simple hash table.
manipulating the routing tables may not have an immediate effect on the kernel's choice of path for a given packet.
flush the routing cache with:

```sh
ip route flush cache
```

## plolicy based networking

policy based routing through the use of multiple routing tables and the routing policy database [RPDB](http://linux-ip.net/html/routing-rpdb.html).

selectors:

- src address
- ToS flags (Type of Service,  second byte in ip-header)
- fwmark (a mark carried through the kernel in the data structure representing the packet)
- inbound interface (on which the packet was received)

### priorities and rules

route will be choosen by priority through the routing policy database with the following selectors:

  route cache | RPDB | route Table
------- | ---------------- | ----------:
 destination | source | destination
 source | destination | ToS
 ToS | ToS | scope
 fwmark | fwmark | oif
 iif| iif | -

If no matching entry is found in the specified routing table, the kernel will pass to the next rule in the RPDB, until it finds a match or falls through the end of the RPDB and all consulted routing tables.

```sh
ip rule show

0:	from all lookup local
32766:	from all lookup main
32767:	from all lookup default
```

- rule 0: This rule, created at RPDB initialization, instructs the kernel to try to find a match for the destination in the local routing table.
- rule 32766: the kernel will perform a route lookup in the main routing table (normaly contain a default route)
- rule 32767: Failing a route lookup in the main routing table the final rule instructs the kernel to perform a route lookup in table 253.

## tables

- multiple routing tables, common tables are local:255 and main:254
- max additional 252 tables (plus local, main, default)
- on top of policy routing
- keyed primarily to destination address (see priority)
- unique integer slots between 0 and 255

For practical purposes, this means that (even) a single routing table can contain multiple routes to the same destination if the ToS differs on each route or if the route applies to a different interface
The ip route and ip rule commands have built in support for the special tables main and local. Any other routing tables can be referred to by number or an administratively maintained mapping file, /etc/iproute2/rt_tables.

The file /etc/iproute2/rt_tables need not exist, as the iproute2 tools have a hard-coded entry for the local table.

- local: special routing table maintained by the kernel. entries can be removed, altered but not added, used for broadcast address, localhost ip, nat
- main: will be used by commands like **route** and **ip route**
- default: special?
- unspec: ?? not available

```sh ip route show table local```

ip addr and ifconfig will cause the kernel to alter the local routing table and main

Clearing routing tables:

```sh
ip route flush table main
```

### route types

[doc](http://linux-ip.net/html/routing-rpdb.html#list-routing-rule-types)

- unicast (default type)
- broadcast
- local
- nat
- unreachable
- prohibit
- blackhole
- throw

## multiple internet connections

[doc](https://lartc.org/howto/lartc.rpdb.multiple-links.html)
[doc](http://linux-ip.net/html/adv-multi-internet.html#ex-adv-multi-internet-outbound-ip-routing)

- outbound traffic only

type of outbound service
split traffic arbitrarily across multiple ISPs for reasons like failover and to accommodate greater aggregate bandwidth than would be available on a single uplink.

- multipath default route
- dead gateway detection:  Julian Anastasov http://ja.ssi.bg/#routes patch

### simple: two separate groups by source IP

- copy main routing table to new one and set alternate default route
- Use iptables/ipchains to mark traffic with fwmark
- Add a rule to the routing policy database.

```sh
# create new table 4
ip route flush table 4
# copy main table
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 4 $ROUTE; done

# set default gw
ip route add table 4 default via 192.168.1.1
# verify
ip route show table 4
```

now mark packages with iptables, only if you will seperate per service

```sh
iptables -t mangle -A PREROUTING -p tcp --dport 80 -s 192.168.99.0/24 -j MARK --set-mark 4 # http
iptables -t mangle -A PREROUTING -p tcp --dport 443 -s 192.168.99.0/24 -j MARK --set-mark 4 # https
iptables -t mangle -nvL # verify
```

All traffic comes from 192.168.99.0/24 and has as destinaion port 80 or 443 will mark with 4
With these iptables lines we have instructed netfilter to mark packets comes from 192.168.99.0/24 and has a destinaion port 80 or 443 with the fwmark 4.

**fwmark**: fwmark added to a packet is only valid and discernible while the packet is still on the host running the packet filter. The fwmark is stored in a data structure the kernel uses to track the packet. Because the fwmark is not a part of the packet itself, the fwmark is lost as soon as the packet has left the local machine.
A convention I find sensible is to use the same number for a routing table and fwmark where possible.

```sh
iptables -t nat -A POSTROUTING -o eth4 -j SNAT --to-source 67.17.28.12
iptables -t nat -A POSTROUTING -o eth1 -j SNAT --to-source 205.254.211.179
```
prepared the NAT rules so that our outbound packets will originate from the correct IPs

```sh
ip rule add fwmark 4 table 4
ip rule show
ip route flush cache
```

At the end set the mark to the defined table. Now marked packages goes to the default gw set in table 4.

### multipath default route

- split traffic over multiple internet providers

- you must add tables to  /etc/iproute2/rt_tables or you get:
Error: argument "lte2" is wrong: table id value is invalid

Setup for three internet outbound connections and one wifi ap.

Internal home network

```txt
ap0: (bridge: enp2s0:home.local, wlp5s0:wifi-home.local), ifip:192.168.2.1
```

Outbound Internet connections

```txt
enp2s0: wire-isp: 192.168.1.1, ifip: 192.168.1.80
enp0s20u1: lte-1: 192.168.3.1, ifip: 192.168.3.2
enp0s20u2: lte-2: 192.168.4.1, ifip: 192.168.4.2
```

First step, route all traffic from source 192.168.2.0 to one service provider 192.168.4.1:

```sh
###### test: route traffic from ap0 to different default gw over enp0s20u2
# add in rt_table: 4 lte-2
# setup tables copy from main and add default gw
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 4 $ROUTE; done
ip route add default via 192.168.4.1 table lte-2
# routing traffic
ip rule add fwmark 4 table 4
iptables -t mangle -A PREROUTING -s 192.168.2.0/24 -j MARK --set-mark 4
iptables -t nat -A POSTROUTING -o enp0s20u2 -j SNAT --to-source 192.168.4.2
# clear cache
ip route flush cache
#####
```

if you not know your external ip then you can use masquerade instead of the snat line:
iptables -t nat -A POSTROUTING -o enp0s20u2 -j MASQUERADE

```sh
# generate for each interface a table. copy from main and add default gw

# wire-isp
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 1 $ROUTE; done
# ip route add 127.0.0.0/8 dev lo table wire-isp #needed?
ip route add default via 192.168.1.1 table wire-isp
ip rule add from 192.168.1.80 table wire-isp # can be main table?

# lte-1
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 3 $ROUTE; done
# ip route add 127.0.0.0/8 dev lo table lte-1 #needed?
ip route add default via 192.168.3.1 table lte-1
ip rule add from 192.168.3.2 table lte-1

# lte-2
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 4 $ROUTE; done
# ip route add 127.0.0.0/8 dev lo table lte-2 #needed?
ip route add default via 192.168.4.1 table lte-2
ip rule add from 192.168.4.2 table lte-2 # must be 192.168.4.0/24?

# enable load-balancing or use
ip route del default

ip route add default scope global nexthop via 192.168.1.1 dev enp1s0 weight 1 \
	    nexthop via 192.168.3.1 dev enp0s20u1 weight 1 \
      nexthop via 192.168.4.1 dev enp0s20u2 weight 1

# need to add mark on each package from each interface and use the table
# multipath will be flow-based not packet based per default [kernel 4.4 ](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=07355737a8badd951e6b72aa8609a2d6eed0a7e7)
# Failover with Pingu?

You only need these rules if your FORWARD chain and INPUT chain has as default policy DROP. The Default of these chains are ACCEPT.

```sh
iptables -A FORWARD -i ap0 -o enp0s20u2 -j ACCEPT
iptables -A FORWARD -i enp0s20u2 -o ap0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
```
#internal routing wg0 to wg0
# -A FORWARD -s 192.168.100.0/24 -d 192.168.100.0/24 -i wg0 -o wg0 -m conntrack --ctstate NEW,RELATED,ESTABLISHED -j ACCEPT
```

## multipath route

dead link will be detected

http://www.austintek.com/LVS/LVS-HOWTO/HOWTO/LVS-HOWTO.dynamic_routing.html

link down problem - plug and play usb network lte router

how to route client packages to multipe gateways?

```sh
ip monitor
```

```sh
conntrack-tools: conntrack -L
```

hash-based multipath routing
https://kernelnewbies.org/Linux_4.4#head-2583c31a65e6592bef9af426a78940078df7f630
https://serverfault.com/questions/696675/multipath-routing-in-post-3-6-kernels


https://www.kernel.org/doc/html/latest/networking/nexthop-group-resilient.html

Kernel Params for Multipath
https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html?highlight=nexthop#:~:text=fib_multipath_use_neigh

sysctl net.ipv4.fib_multipath_use_neigh
sysctl net.ipv4.fib_multipath_hash_policy

## Hotplugging Devices

1. overwrite presence on boot
https://wiki.archlinux.org/title/systemd-networkd#:~:text=without%20systemd%2Dnetworkd.-,systemd%2Dnetworkd%2Dwait%2Donline,-Enabling
https://github.com/NixOS/nixpkgs/issues/30904
Parameter: https://man.archlinux.org/man/systemd-networkd-wait-online.8

2. setup
cat network-setup.service.wants/network-addresses-enp0s20u1.service

example: this script will setup ip and route
/nix/store/5mbh88iwk4gy77yvyqqygb0smisk31as-unit-script-network-addresses-enp0s20u1-start/bin/network-addresses-enp0s20u1-start
example: this script will delete the route and ip
/nix/store/3514yad1jjk8pnchl1fxw6xvz3wxvl0j-unit-script-network-addresses-enp0s20u1-pre-stop/bin/network-addresses-enp0s20u1-pre-stop

When service of interface stop or link down then nexthop will be switched (dont use route -n):

```sh

# ip route show
 default proto static
        nexthop via 192.168.1.1 dev enp1s0 weight 1
        nexthop via 192.168.3.1 dev enp0s20u1 weight 1 dead linkdown
        nexthop via 192.168.4.1 dev enp0s20u2 weight 1
```


But all tables lost this link entry and the table for this device lost the default gw!

192.168.3.0/24 dev enp0s20u1 proto kernel scope link src 192.168.3.2 # get lost

must be readded for each table:

ip route add 192.168.3.0/24 dev enp0s20u1 proto kernel scope link src 192.168.3.2 table 1
ip route add 192.168.3.0/24 dev enp0s20u1 proto kernel scope link src 192.168.3.2 table 4



**brdige link will get lost :-( but not when interface will be stopped**

systemctl restart dnsmasq # will fail because no ap0
systemctl restart network-addresses-ap0.service # setup again
systemctl restart dnsmasq # will fail because no ap0 # works


**when lte card unplugged the default multipath route will be deleted**

- plug in
- systemctl start network-addresses-enp0s20u1.service
- set multipath default gateways


**Todo: Solution**

- systemd service oneshot: setup tables set default route
- systemd service check timer: tables interfaces and ap0
- udev: pluggin plugoff detection and set tables, gateways

- grafana-agent
  - returned HTTP status 400 Bad Request: user=253892: err: out of order sample
  - too far behind (logs)
- wifi tuning
- enable ipv6
- INTERRUPTS AND IRQ TUNING:
  - https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/performance_tuning_guide/s-cpu-irq
  - https://francis.begyn.be/blog/nixos-home-router#:~:text=range%2010.1.90.128%2010.1.90.254%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%27%27%3B%0A%20%20%7D%3B-,Performance%20tuning,-The%20squeeze%20the
- RECEIVE PACKET STEERING (RPS)
  - https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/performance_tuning_guide/network-rps


## udev hotplug

**spin up boot when network card is not plugged in**

```nix
systemd.services = {
    "network-link-enp0s20u1".wantedBy = lib.mkForce [];
    "network-addresses-enp0s20u1".wantedBy = lib.mkForce [];
  };
```

but when you reboot or start the router this interface has no ip address.
create a udev rule to restart the ip address service and trigger routing table and gateway recreation.


```sh
# with nexthops
default proto static
	nexthop via 192.168.1.1 dev enp1s0 weight 1
	nexthop via 192.168.3.1 dev enp0s20u1 weight 1

# with only single gw
default via 192.168.1.1 dev enp1s0 proto static
```

enable udev debug infos:
udevadm control --log-priority=debug
journalctl -f

## Tuning

- before tuning:
	- 12:29 82.41 Down / 24.00 Up / 11ms ping

speedtest-cli --source 192.168.1.80
speedtest-cli --source 192.168.4.2
speedtest-cli --source 192.168.3.2


udevadm monitor

https://packetpushers.net/udev/
https://ww.telent.net/2016/12/15/hotplug_scripts_in_nixos
https://www.tecmint.com/udev-for-device-detection-management-in-linux/
https://github.com/NixOS/nixpkgs/blob/master/nixos/modules/services/hardware/udev.nix

## infos

Don't forget to point out that fwmark with ipchains/iptables is a decimal number, but that iproute2 uses hexadecimal number.

Path MTU can be quite easily broken if any single hop along the way blocks all ICMP. Be sure to allow ICMP unreachable/fragmentation needed packets into and out of your network. This will prevent you from being one of the unclueful network admins who cause PMTU problems.


Note that balancing will not be perfect, as it is route based, and routes are cached. This means that routes to often-used sites will always be over the same provider. It also means that the source IP might change so websites that requires login (webmail, banks etc) will break if they check if the clients ip is consistent. Banking sites often do this. It is recommended to avoid this feature if possible.
multipath routing: The best we can do is round-robin with weight
There is no automatic way of detecting a dead link. However, a simple script can send a ping across each link periodically and then reconfigure the routes to exclude a dead link (and re-enable it when it comes back up)

ping -n -c2 -I192.168.1.2 ping.ovh.net
bridge link show
iptables -t nat -v -L POSTROUTING -n --line-number
iptables -t nat -D POSTROUTING 1

iptables -A INPUT -j LOG # enable logging
iptables -A INPUT -s 192.168.2.0/24 -j LOG --log-prefix '** APIN **'
iptables -A INPUT -s 192.168.4.0/24 -j LOG --log-prefix '** LTE-2-IN **'

p vrf # virtual routing

ip -s -s link show wg0 # show interface infos, transmit errors aso

wireguard debug dmesg:
enable: echo 'module wireguard +p' > /sys/kernel/debug/dynamic_debug/control
disable: echo 'module wireguard -p' > /sys/kernel/debug/dynamic_debug/control

# copy main table to table 4
ip route show table main | grep -Ev ^default | while read ROUTE; do ip route add table 4 $ROUTE; done

continue: http://linux-ip.net/html/ch-nat.html

switch to nftables: https://wiki.nftables.org/wiki-nftables/index.php/Main_Page

http://multipath-tcp.org/pmwiki.php/Users/ConfigureRouting
https://codecave.cc/multipath-routing-in-linux-part-1.html#:~:text=With%20multipath%20routing%20you%20can,%E2%86%92interface%20association%20or%20both).
nix: https://github.com/NixOS/nixpkgs/blob/master/pkgs/os-specific/linux/iproute/mptcp.nix

[Linux with many internet connections and patches](http://ja.ssi.bg/nano.txt) history version
[Kernel Packet Traveling Diagram](https://www.docum.org/docum.org/kptd/)
[ip route](http://linux-ip.net/html/tools-ip-route.html)
http://linux-ip.net/html/ch-advanced.html
http://linux-ip.net/html/adv-multi-internet.html#ex-adv-multi-internet-outbound-ip-routing
