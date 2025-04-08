---
author: "ripx80"
title: ""
linktitle: ""
description: ""
date: 2025-11-20
draft: true
tags:
  - network
  - security
keywords:
  - network
  - security
weight: 0
---

# 50 things you can do with nftables

## use only a specific time of the day to allow internet access
- time based rules: test

```txt
nft add rule inet t c 'meta nfproto ipv4 meta time "2022-10-01 00:00:00"-"2022-10-02 00:00:00" meta hour "11:50:00"-"12:15:00" counter jump drop_to_wan comment "!fw4: Block-Traffic"'

table inet filter {
    chain input {
        type filter hook input priority 0; policy accept;
        tcp dport 25 hour 00:00-04:00 drop
    }
}
```

## ratelimiting for special endpoints
## mark packets for routing tables
## use a special routing table
## use two nexthops (gateways) multiple internet gateways
## QoS for a special endpoint
## QoS for a pool of endpoints
## define a mirror (duplicate traffic) socket

```txt
# sends all duplicated packets to 10.0.0.1
# run this before applying this file
# sudo ip addr add 10.0.0.1/24 dev lo

# clean up with
# sudo ip addr delete 10.0.0.1/24 dev lo
# nft flush ruleset

flush ruleset

table ip mangle {
    chain prerouting {
        type filter hook prerouting priority mangle; policy accept;
        iifname != lo udp dport 8000-8100 dup to 10.0.0.1 device lo notrack
    }

	chain input {
		type filter hook input priority mangle; policy accept;
        iifname lo udp dport 8000-8100 ip daddr set 10.0.0.1 notrack
	}
}
```
## define a mirror interface
## use nftrace
## use nft monitor to see events
## match traffic by username
## match traffic by group
## use flowtables for fast forwarding
## prevent malisous traffic like xmas, synflood, pingflood aso
## define connection limits on ssh port
## how can i check if the routing fragment packages (fragmentation)
## manipulate the ttl of a packet
## forward traffic to another interface
## forward and masquerade traffic to another interface
## only allow forwarding from srcip to dstip
## how to log a tcp connection wiht sequences
## what are udplite, sctp, dccp, ah, esp, comp, frag, hbh, mh, rt, vlan, ct, igmp, upnp, pcp, mdns,
## build a mac address filter for local devices
## match vlan with mac type
## set priority on packets
## log ssh login to journald
## log level from warn, to critical
## reject a package with host-unreacable, or something else
## set a limit rate of bytes
## set a limit rate of packages in a minute
## do dst nat
## port forwarding
## use a queue
## export config to json
## use contrackt tools
## use expressions for rules: https://wiki.nftables.org/wiki-nftables/index.php/Building_rules_through_expressions
## redirect 8.8.8.8 requests to local dns server
## match packet headers like counting srcip or dstip
## count outgoing traffic by nexthop
## using the fib statement
## use as a load balancer (round-robin)
## queuing to userspace
## port knocking
## geoip matching
## man in the middle things: dns redirects, intercept traffic, duplicate traffic
## log special dropeed requests from inside like ssh, or other traffic
## block all traffic outside of a vpn tunnel
htps://michael.kjorling.se/blog/2022/using-linux-nftables-to-block-traffic-outside-of-a-vpn-tunnel/
## using split tunneling
https%3A%2F%2Fmullvad.net%2Fen%2Fhelp%2Fsplit-tunneling-with-linux-advanced&usg=AOvVaw3mrA_bbhd6xaJ_KOdUZvU6&opi=89978449


```txt
nft add rule nat prerouting dnat to numgen inc mod 2 map { \
               0 : 192.168.10.100, \
               1 : 192.168.20.200 }
```

- meta information: https://wiki.nftables.org/wiki-nftables/index.php/Matching_packet_metainformation

## use as lb (weights)

```txt
nft add rule nat prerouting dnat to numgen inc mod 10 map { \
               0-5 : 192.168.10.100, \
               6-9 : 192.168.20.200 }
```
- https://pablotron.org/articles/nftables-examples/
-  NOTE: "iifname" is slower than "iif", but it allows name globbing
-  https://www.procustodibus.com/blog/2021/11/wireguard-nftables/
-  https://blog.cloudflare.com/how-to-drop-10-million-packets-de-de/
-  https://paulgorman.org/technical/linux-nftables.txt.html

## redirect port to a local port
## redirect port to local vm
## pat
port address translation  (pat)

## rate limit with tc
- use tc rules to rate limit a src_ip static
- use tc rules to rate limit a src_ip dynamic
- https://lartc.org/howto/lartc.qdisc.html

## use iproute2 for rate limit per interface
- https://lartc.org/howto/

## change priority of a group log

## todo: a way to log only valid credentials logins?

- iif canot be used in checkRuleset in nixos use ifname instead


- The connection tracking system supports accounting, which means counting packets and bytes for each flow and for each flow direction. This feature is deactivated by default. You can activate it with this sysctl:
sysctl -w net.netfilter.nf_conntrack_acct=1
conntrack -L

- #iif $if_in oif $if_out accept comment "only from all clients in internal to internet"
- add per src_ip network counters like ssh or dns
- counter for network traffic per src_ip
- QoS with nftables?
- loadbalancing nexthop
- how can you test the speed of fw?
- tracing ssh connection

## counting https

```nft
table inet fw {
    set https { type ipv4_addr; flags dynamic; size 65536; timeout 60m; comment "counter per ip https request";}
    chain input {
        type filter hook input priority 0; policy drop;
        tcp dport 443 accept
        ct state new tcp dport 443 update @https { ip saddr counter } comment "count https requests"
    }

}
```

nft list set inet filter https
