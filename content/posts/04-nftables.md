---
author: "ripx80"
title: "nftables - basics"
linktitle: "nftables basics"
description: "overview of the use of nftables with nix"
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

nftables is the modern linux kernel (>= 3.13 nft [support](https://git.netfilter.org/nftables/log/doc?showmsg=1)) packet classification framework to replace iptables.

this post will get the basics and useful commands/rules for nftables and some usecases how nftables will configured in case of a nixos system in a default way.

if you search for a advanced topic i recommend the **nftables advanced router post** (comming soon).
need additional ideas or use cases? take a look at **50 things - nftables** (comming soon).

- system: x86_64
- kernel: 6.7.9
- nixos: 23.11
- nftables: 1.0.9
- libressl-3.8.2-nc

nixos modules:

- [firewall](https://github.com/nixos/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall.nix)
- [firewall-nftables](https://github.com/nixos/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall-nftables.nix)
- [nftables](https://github.com/nixos/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/nftables.nix)

## netfilter

"the [netfilter](https://www.netfilter.org/) project enables packet filtering, network address [and port] translation (na[p]t), packet logging, userspace packet queueing and other packet mangling.

the netfilter hooks are a framework inside the linux kernel that allows kernel modules to register callback functions at different locations of the linux network stack. the registered callback function is then called back for every packet that traverses the respective hook within the linux network stack." - netfilter.org

so, netfilter is the linux framework for manipulating network packets. it can filter and transform packets at predefined points in the kernel.

on top of netfilter sit the firewalls: the venerable iptables, and the new nftables.

## nft

nft is the shell command to manipulate nftables. it can list the ruleset, add, delete and change rules in nftables.

{{< garry "note that the **position** of the statements within your rule is significant, because nftables evaluates expressions and statements linearly from left to right.">}}

here are some useful commands to interact with nftables and netfilter which i have used in this journey.

```sh
# show
nft list tables                     # list current tables
nft --stateless list table filter   # list table filter, omit stateful information like counters
nft -s list ruleset                 # list all nft instructions
nft -a list chains                  # list all chains with handle (need to delete)
nft list counters                   # list all named counters
nft -j list ruleset                 # output the complete ruleset in json format
nft list ruleset -a                 # get the handle to delte a rule
nft monitor                         # see live changes on ruleset

# manipulate
nft delete rule inet nixos-fw input-allow handle 17     # delete rule in nixos-fw chain input-allow handle 17
nft add ip chain nat prerouting '{ policy drop; }'      # add chain prerouting with default policy drop
nft add chain ip nat postrouting '{ policy accept; }'   # add chain nat postrouting with default policy accept

# clear
nft flush table ip filter   # flush only table ip filter
nft flush ruleset           # flush all rules

# test
nft -c -o -f ruleset.test   #  read the nft file (f), optimize ruleset(o) in dry-run mode (c)
```

if you need more commands like insert or replace take a look at the [nftables wiki](https://wiki.nftables.org/wiki-nftables/index.php/quick_reference-nftables_in_10_minutes).
the dry-run command is a good idea if you want to test your ruleset (syntax not functonally) and not apply directly to your system.

on nixos systems you can find your nftables evaluated ruleset when you build it from your config with ```sh nixos-rebuild build --flake .#mysystem``` in the file
result/etc/systemd/system/nftables.service

```txt
execstart=/nix/store/ngdbcld1pdh1h8zpn1541c35zv25q6r2-nftables-rules # example path on mysystem
```

## families

nft has different family types to interact with:

- ip: only see ipv4 traffic
- ip6: only see ipv6 traffic
- inet: tables of this family see both ipv4 and ipv6 traffic/packets, simplifying dual stack support.
- arp: arp level traffic
- bridge:  traffic/packets traversing bridges
- netdev: the netdev family is different from the others in that it is used to create base chains attached to a single network interface. such base chains see all network traffic on the specified interface, with no assumptions about l2 or l3 protocols.

for example if you want to create a packet filter for ipv4 and ipv6 you can use inet to handle both in one ruleset.

## nft monitor

with ```sh nft monitor``` you can see live rules changes (event based).
for example start nft monitor and then add a rule to your ruleset.

```sh
nft monitor
# different shell
nft add rule inet fw services iif "wg0" tcp dport 443 # open port 443 on wireguard wg0 interface
nft -a list chain services
```

you will see in your monitor shell something like this:

```sh
add rule inet fw services iif "wg0" tcp dport 443
# new generation 3 by process 397259 (nft)
```

after that we delete this rule. to delete a rule you must get the internal handle of that rule.

```sh
nft -a list chain inet fw services # get the handle, 19
nft delete rule inet fw services handle 19
```

with nft monitor you will see if some process will change your nft rules. this is useful if you inspect how kubernetes or some container runtimes will manipulate the rules to route traffic to their internal services.

## nftrace

nftrace is since nftables v0.6 and linux kernel 4.6, ruleset [debug/tracing](https://wiki.nftables.org/wiki-nftables/index.php/ruleset_debug/tracing) is supported.
nftrace is part of the metainformation of a packet so you must enable it for a specific packet that you want to debug.

```sh
nft add rule inet fw services iif "wg0" tcp dport 443 meta nftrace set 1 accept # open port 443 on wg0 with tracing enabled
nft monitor trace # start and waiting for events
```

now we connect from another maschine to port 443 on wg0. keep in mind that when you use your localhost and the interface "lo" is a trusted interface you will not see any event. for testing i use netcat to create a service on mymaschine and connect from the outside

```sh
nc -l 192.168.1.2 443   # listen only on wg0 port 443 tcp
nc 192.168.1.2 443      # connect to this port from a external maschine (192.168.100.3)
```

after the connect a event is pop up in monitor

```txt
trace id 5ac77d91 inet fw services packet: iif "wg0" ip saddr 192.168.1.3 ip daddr 192.168.1.2 ip dscp cs0 ip ecn not-ect ip ttl 64 ip id 1816 ip protocol tcp ip length 60 tcp sport 40776 tcp dport 443 tcp flags == syn tcp window 32160
trace id 5ac77d91 inet fw services unknown rule handle 22 (verdict accept)
```

we get a lot of information here:

- trace id
- saddr, daddr
- sport, dport
- ttl
- handle of that rule

if you want to enable tracing for a complete chain or before the input rules are processed you can add a tracing chain.
[here](https://wiki.nftables.org/wiki-nftables/index.php/ruleset_debug/tracing#:~:text=same%20trace%20session.-,complete%20example,-here%20is%20complete) is a good example how you can do that.

## nftables with nixos

nftables can be enabled with the nixos setting ```nix network.nftables.enable = true;```. this will add the **pkgs.nftables** to your system environment and create a default ruleset for your system.

```sh
# default name nixos-fw, inet is for ipv4 and ipv6 traffic
table inet nixos-fw {
    # chain for reverse path filtering and dhcp
    chain rpfilter {
        # this will change the priority of mangle to 10 and a default chain policy to drop
        type filter hook prerouting priority mangle + 10; policy drop;
        # this will open dhcpv4 on port 68 and 67 bootp
        meta nfproto ipv4 udp sport . udp dport { 68 . 67, 67 . 68 } accept comment "dhcpv4 client/server"
        # check reverse path, see cfg.checkreversepath
        fib saddr . mark . iif oif exists accept
    }
    # default input chain
    chain input {
        # filter with default drop policy
        type filter hook input priority filter; policy drop;
        # lo is a trusted interface, see networking.firewall.trustedinterfaces
        iifname "lo" accept comment "trusted interfaces"
        # track the state of the conntrack, new and untracked will handled in input-allow
        ct state vmap { invalid : drop, established : accept, related : accept, new : jump input-allow, untracked : jump input-allow }
    }
    # allow dhcpv6 without any trusted ports defined in networking.firewall.allowedtcpports
    chain input-allow {
        icmpv6 type != { nd-redirect, 139 } accept comment "accept all icmpv6 messages except redirects and node information queries (type 139).  see rfc 4890, section 4.4."
        ip6 daddr fe80::/64 udp dport 546 accept comment "dhcpv6 client"
    }
}
```

this is the default ruleset when nftables is enabled on a nixos system and you have no additional options.
you can see the function of each instruction in the comments or look into the nixos modules.
other interesting options can find under ```nix network.firewall``:

- logreversepathdrops
- logrefusedconnections
- logrefusedpackets
- logrefusedunicastsonly
- rejectpackets
- allowping
- pinglimit

take a look at [nixos options](https://search.nixos.org/options?channel=23.11&from=0&size=50&sort=relevance&type=packages&query=firewall) for a detailed explaination of each option.

this is my default configuration for a normal system without advanced routing stuff.

```nix
networking = {
  firewall = {
      enable = true;
      logrefusedconnections = false;        # disable logging of refuded connections
      logrefusedpackets = false;            # disable logging of refused packages
      allowping = true;                     # allow ping for diagnostics
      interfaces.eth0 = {                   # allow wireguard connections from the internet
        allowedudpports = [
            meta.${config.networking.hostname}.wg.port
        ];
      };

      interfaces.wg0 = {                    # internal wireguard services
        allowedtcpports = [ 22 53 ];        # allow internal ssh and dns via tcp connections
        allowedudpports = [ 53 ];           # allow internal dns via upd (default for dns queries)
      };
    };
};
```

this config allows only wireguard connections to a open port to the internet.

internal services like ssh and dns connections are accessable via internal wireguard.
this will protect the system for unallowed ssh connection attemps from outside and reduce the attack options.

log for refuded connections and packets are disabled because i dont need it.

{{< garry "meta is a git-encrypt file which contains ip addresses, port numbers and other stuff that are not to be landed in git's cleartext history. normaly you will add here your wireguard port number as integer">}}

## conclusion

now i have the basics that i need to setup a simple packet filter on my nixos hosts and debug the current rule set.
i can only recommend looking into the sources given to familiarize yourself with the whole topic.

time to get hands dirty for the real project of this journey: the nixos wireguard router with vpn support (comming soon).

## learned

- [difference](https://www.kernel.org/doc/documentation/networking/ip-sysctl.txt) between net.ipv4.conf.all.forwarding and net.ipv4.ip_forward.
- sysctl --system shows all system settings without a config file
- ip mangle table: it is basically used to set specific headers for ip packets to affect the routing decision made further on. like mtu or ttl.
- nixos opens automaticly dhcp ipv4 and ipv6 ports when networking.firewall.enable = true.
- nixos networking.firewall.checkreversepath is default true
- libressl-3.8.2-nc is a dependency of libressl-3.8.2 which is part of gibc of all nixos systems, so nc is available on default
  nix-store --tree --query /nix/store/kvkiy1i5d1mh4q3rylsy4qshsrgsimaa-libressl-3.8.2-nc
- refreshing netcat commands

```sh
nc host port (tcp connection)
nc -u host port (udp connection)
nc -z -v domain.com 1-1000 # port scanning
nc -l 4444 # listen
nc -l 4444 > received_file # files through
nc domain.com 4444 < original_file
nc 'http/1.1 200 ok\n\n%s' "$(cat index.html)" | netcat -l 8888 # http://server_ip:8888
```

## docs

- [wiki](https://wiki.nftables.org/wiki-nftables/index.php/main_page)
- [timeline log](https://git.netfilter.org/nftables/log/doc?showmsg=1) of nft development
- [nft in 10 minutes](https://wiki.nftables.org/wiki-nftables/index.php/quick_reference-nftables_in_10_minutes)
- [nftables on nixos](https://scvalex.net/posts/54/)
- [flowtables](https://wiki.nftables.org/wiki-nftables/index.php/flowtables)
- [flowtables kernel](https://docs.kernel.org/networking/nf_flowtable.html)
- [deep explaination of flowtables](https://thermalcircle.de/doku.php?id=blog:linux:flowtables_1_a_netfilter_nftables_fastpath)
- [nixos-home-router](https://francis.begyn.be/blog/nixos-home-router)
- [nixos-router](https://pavluk.org/blog/2022/01/26/nixos_router.html)
- [wireguard nftables](https://www.procustodibus.com/blog/2021/11/wireguard-nftables/)
