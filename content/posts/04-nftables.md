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

update: **2024-04-20**

nftables is the modern linux kernel (>= 3.13 nft [support](https://git.netfilter.org/nftables/log/doc?showmsg=1)) packet classification framework to replace iptables.

iptables is not covered in this essay.

you need such packet filters in firewalls and routers to accept, drop or forward network packets.
this post will deal the basics of nftables and show some commands/rules to handle rules and configure this rules in your linux system.
in particular, a nixos system and its configuration are discussed but these rules apply to most systems with nftables.

if you search for a advanced topic and how i configure a real world router i recommend the **nftables advanced router** (comming soon) post.
do you need further use cases or fresh ideas? take a look at **50 things - nftables** (comming soon) post.

- system: x86_64
- kernel: 6.7.9
- nixos: 23.11
- nftables: 1.0.9
- libressl-3.8.2-nc (netcat)

nixos modules:

- [firewall](https://github.com/nixos/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall.nix)
- [firewall-nftables](https://github.com/nixos/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall-nftables.nix)
- [nftables](https://github.com/nixos/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/nftables.nix)

## netfilter

netfilter is the underlying framework in the linux kernel on which nftables is based.

"the netfilter project enables packet filtering, network address [and port] translation, packet logging, userspace packet queueing and other packet mangling.

the netfilter hooks are a framework inside the linux kernel that allows kernel modules to register callback functions at different locations of the linux network stack. the registered callback function is then called back for every packet that traverses the respective hook within the linux network stack." - netfilter.org

this is the current statement of the netfilter project what netfilter is.
in this case we only know, that netfilter is the linux framework for manipulating network packets. it can filter and transform packets at predefined points in the kernel.

nftables sits on top of this framework.

## nft

nft is the shell command to manipulate the packet filter inside the kernel.
nft can be used to list, manipulate and debug rules.

{{< garry "note that the position of the statements within your rule is significant, because nftables evaluates expressions and statements linearly from left to right.">}}

here are some commands to interact with the packet framework.

```sh
# show
nft list tables                     # list current tables
nft list counters                   # list all named counters
nft --stateless list table filter   # list table filter, omit stateful information like counters
nft -s list ruleset                 # list all nft instructions
nft -a list chains                  # list all chains with handle (need to delete)
nft -j list ruleset                 # output the complete ruleset in json format, export
nft list ruleset -a                 # get the handle to delte a rule
nft monitor                         # see live changes on ruleset

# manipulate
nft delete rule inet nixos-fw input-allow handle 17     # delete rule in nixos-fw chain input-allow handle 17
nft add ip chain nat prerouting '{ policy drop; }'      # add chain prerouting with default policy drop
nft add chain ip nat postrouting '{ policy accept; }'   # add chain nat postrouting with default policy accept
nft replace rule inet forward handle 5 iif "et0" oif "eth1" counter accept # replace a current rule with a new one

# clear
nft flush table ip filter   # flush only table ip filter
nft flush ruleset           # flush all rules

# test
nft -c -o -f ruleset.test   #  read the nft file (f), optimize ruleset(o) in dry-run mode (c)
```

further commands can be found in the official [nftables wiki](https://wiki.nftables.org/wiki-nftables/index.php/quick_reference-nftables_in_10_minutes).

if the ruleset should to be testet for syntactical erros it is a good idea to use the dry-run or check feature.
no rules are applied to the running system.

## families

nftables has different family types with which you can interact. these families represent multiple networking levels.
if the different network layers are no longer present, it is advisable to look at the osi-model first.

- ip: only see ipv4 traffic
- ip6: only see ipv6 traffic
- inet: tables of this family see both ipv4 and ipv6 traffic/packets, simplifying dual stack support.
- arp: arp level traffic
- bridge:  traffic/packets traversing bridges
- netdev: the netdev family is different from the others in that it is used to create base chains attached to a single network interface like "eth0".
  such base chains see all network traffic on the specified interface, with no assumptions about layer 2 or layer 3 protocols.

for example if you want to create a rule to filter a packet for ipv4 and ipv6 you can use "inet" to handle both protocols in one rule.

```sh
add rule inet filter input udp dport 53 accept
```

this rule is applied to ipv4 **and** ipv6 and allows packets based on the udp protocol with destination port 53 (usually dns) to pass the filter.
but you can also set the ip protocol in the inet family.

```sh
# use ip or ipv6 to define the protocol version
add rule inet filter input ip udp dport 53 accept
```

with the "ip" keyword this rule is only applied to ipv4 packets not for ipv6.

## basic structures

### table

a table is top structure to contain multiple chains.
each table has a family type and name. the default type is **ip**.

```sh
# diplay tables
nft list tables
```

### chain

a chain is located inside a table and has a specific **type** like filter, route, nat.
in addition a chain has a speical **hook** that indicates the stage in which the packet is precoessed in the kernel
like prerouting, input, forward, output and postrouting.

note that some types and hooks are only available for certain families.

each chain has a **priority** that refers to a number used to order the chains or to set them between some netfilter operations.
when you set a priority (default is 0) you can use the number or the defined constant.

- NF_IP_PRI_CONNTRACK_DEFRAG (-400)
- NF_IP_PRI_RAW (-300)
- NF_IP_PRI_SELINUX_FIRST (-225)
- NF_IP_PRI_CONNTRACK (-200)
- NF_IP_PRI_MANGLE (-150)
- NF_IP_PRI_NAT_DST (-100)
- NF_IP_PRI_FILTER (0) - default
- NF_IP_PRI_SECURITY (50)
- NF_IP_PRI_NAT_SRC (100)
- NF_IP_PRI_SELINUX_LAST (225)
- NF_IP_PRI_CONNTRACK_HELPER (300)

```sh
nft add chain inet mytable mychain '{ type filter hook input priority -10; }'
```

this command creates a chain **'mychain'** in table **'mytable'** with a priority of **'-10'** for the **'input'** hook.
a lower number indicates a higher priority, so this chain would process packets before the default input chain (priority 0).

```sh
# display chains
nft list chains
```

### rule

an rule is a specific instruction that defines how packets should processed within a tabel's chain.
it represents a single action or a set of conditions applied to a packet.

a **match** is a condition that determine whether a rule applies to a packet. matches can include protocols (tcp, udp, icmp),
packet metadata, connection tracking states and custom defined data or payload inspections.

a **action** can defined when a rule match like accept, drop, reject, log, queue or continue.

each rule has its own handle (numeric reference), which identifies the rule within the chain in which it is located.

 ```sh
 nft -a list chain inet fw services
 ```

this command displays all rules with handle in chain **'services'** and table **'fw'**.

## nft monitor

```sh
nft monitor
```

allows you to observe or track live changes to the ruleset.
nft monitor is informed via kernel events thats a change has been made to the current ruleset.
only then is something output.

for example start nft monitor and then add a rule to your ruleset.
two different shells are needed, one to monitor the event and one to apply the rule.

```sh
nft monitor # 1. shell, this will catch the prompt
# 2. shell
nft add rule inet fw services iif "eth0" tcp dport 443 accept
nft -a list chain services
```

this rule will open ipv4 and ipv6 tcp port 443 (usaly https) on interface "eth0".
the rule will be stored in table "fw" and the chain "services".

you will see in your monitor shell something like this:

```sh
add rule inet fw services iif "eth0" tcp dport 443 accept
# new generation 3 by process 397259 (nft)
```

you see the generation "3" of the ruleset. in addition the process (397259) and command (nft) that changed it.
then we delete the previously created rule again.
to delete a rule the internal handle of the respective rule is required.

```sh
nft -a list chain inet fw services # in my case, get the handle 19
nft delete rule inet fw services handle 19
```

nft monitor is particularly helpful to debug processes that make independent changes to the ruleset.
for example, container orchestration or container runtime environments like kubernetes.

## nftrace

nftrace is the [debug and tracing](https://wiki.nftables.org/wiki-nftables/index.php/ruleset_debug/tracing) tool for nftables which is since nftables version 0.6 and linux kernel 4.6 supported.
to use it, the packet to be tracked must be marked via the meta information of nftables.
to do this, we use the rule from above and set the meta information for this specific packet.

```sh
nft add rule inet fw services iif "eth0" tcp dport 443 meta nftrace set 1 accept # enable tracing
nft monitor trace # start and waiting for events
```

tracing for https (usaly) was activated using the statement **'meta nftrace set 1'**
the tracing takes place via the **'nft monitor trace'** cmd.

to generate some traffic on port 443 and thus some events, i like to use netcat.
first we create a listener to connect to it.

```sh
nc -l 192.168.1.2 443   # listen only on eth0 port 443 tcp
```

you have to make sure that it does not run via the internal loopback 'lo' interface, as this is usually configured as trusted and always works in conjunction with nftables. In addition, the tracing rule would not work here.

that's why i connect from another maschine to the 'eth0' interface with the ip '192.168.1.2' via netcat.

```sh
nc 192.168.1.2 443      # connect to this port from a external maschine (192.168.100.3)
```

after the successful connection, a event is displayed in **nft monitor trace**

```txt
trace id 5ac77d91 inet fw services packet: iif "eth0" ip saddr 192.168.1.3 ip daddr 192.168.1.2 ip dscp cs0 ip ecn not-ect ip ttl 64 ip id 1816 ip protocol tcp ip length 60 tcp sport 40776 tcp dport 443 tcp flags == syn tcp window 32160
trace id 5ac77d91 inet fw services unknown rule handle 22 (verdict accept)
```

a lot of interesting information is displayed in this tracing event.

- 5ac77d91: trace id
- inet: family
- chain: services
- eth0: interface
- 192.168.1.3: source addresse (connect from)
- 192.168.1.2: destination address (connect to)
- 40776: source port (connect from)
- 443: destination port (connect to)
- 22: exact handle of the rule that triggers the event

and some debugging informations like ttl (64), tcp flags (syn) and window size (32160).

if you want to enable tracing for a complete chain or before the input rules are processed you can add a tracing chain.
the [nftables wiki](https://wiki.nftables.org/wiki-nftables/index.php/ruleset_debug/tracing#:~:text=same%20trace%20session.-,complete%20example,-here%20is%20complete) has a good example of how you do this.

after debugging, the tracing rule should be deleted.

## nftables with nixos

after the basic introduction to nftables, here is how to configure this in nixos.
nftables can be enabled with this nixos setting.

```nix
network.nftables.enable = true;
```

this will add the **pkgs.nftables** to your system environment and create a default ruleset for your system.
you can display the default ruleset with the following command.

```sh
$ nft list ruleset

# default name nixos-fw, inet rules defined for ipv4 and ipv6 traffic
table inet nixos-fw {
    # chain for reverse path filtering and dhcp
    chain rpfilter {
        # this will change the priority of mangle to 10 and a default chain policy to drop
        type filter hook prerouting priority mangle + 10; policy drop;
        # this will open dhcpv4 on port 68 and 67 bootp
        meta nfproto ipv4 udp sport . udp dport { 68 . 67, 67 . 68 } accept comment "dhcpv4 client/server"
        # check reverse path, see networking.firewall.checkReversePath
        fib saddr . mark . iif oif exists accept
    }
    # default input chain
    chain input {
        # filter with default drop policy
        type filter hook input priority filter; policy drop;
        # lo is a trusted interface, see networking.firewall.trustedInterfaces
        iifname "lo" accept comment "trusted interfaces"
        # track the state of the conntrack, new and untracked will handled in input-allow
        ct state vmap { invalid : drop, established : accept, related : accept, new : jump input-allow, untracked : jump input-allow }
        # log invald syn tcp connections
        tcp flags syn / fin,syn,rst,ack log prefix "refused connection: " level info
    }

    chain input-allow {
        # allow ping requests
        icmp type echo-request accept comment "allow ping"
         # allow dhcpv6
        icmpv6 type != { nd-redirect, 139 } accept comment "accept all icmpv6 messages except redirects and node information queries (type 139).  see rfc 4890, section 4.4."
        ip6 daddr fe80::/64 udp dport 546 accept comment "dhcpv6 client"
        # without any trusted ports defined in networking.firewall.allowedTcpPorts
    }
}
```

this is the default ruleset for nixos when nftables is enabled and if no changes have been made.
you can see the function of each instruction in the comments or look into the official nixos modules.

It is interesting to note that dhcp cannot be blocked or switched off via the nixos module.
if no dhcp is required, this can only be circumvented by flashing the entire ruleset.

other interesting options of the nixos module **network.firewall** are:

- logReversePathDrops
- logRefusedConnections
- logRefusedPackets
- logRefusedUnicastsOnly
- rejectPackets
- allowPing
- pingLimit

take a look at [nixos options](https://search.nixos.org/options?channel=23.11&from=0&size=50&sort=relevance&type=packages&query=firewall) for a detailed explaination of each option.

on a normal system without advanced routing stuff or special security requirements is this my preferred configuration.

```nix
networking = {
  firewall = {
      enable = true;
      logRefusedconnections = false;        # disable logging of refuded connections
      logRefusedPackets = false;            # disable logging of refused packages
      allowPing = true;                     # allow ping for diagnostics
      interfaces.eth0 = {                   # allow wireguard connections from the internet
        allowedUdpPorts = [
            meta.${config.networking.hostname}.wg.port
        ];
      };

      interfaces.wg0 = {                    # internal wireguard services
        allowedTcpPorts = [ 22 53 ];        # allow internal ssh and dns via tcp connections
        allowedUdpPorts = [ 53 ];           # allow internal dns via upd (default for dns queries)
      };
    };
};
```

this config allows only wireguard connections to a open port to the internet.
internal services like ssh and dns connections are accessable via the internal wireguard network.
this will protect the system for unallowed ssh connection attemps from outside and reduce the attack vector.

log for refuded connections and packets are disabled because i dont need it.

{{< garry "meta.nix is a git-encrypt file which contains ip addresses, port numbers and other stuff that are not to be landed in git's cleartext history. it is imported and the individual fields are accessed via the hostname like you see above. normaly you will add here your wireguard port number as integer">}}

when you build the configuration via **'nixos-rebuild build --flake .#mysystem'** the path to the evaluated ruleset can be found in the systemd file 'result/etc/systemd/system/nftables.service'. Search for the line beginning with ExecStart to identify the nix store path of nftables-rules.

```txt
ExecStart=/nix/store/ngdbcld1pdh1h8zpn1541c35zv25q6r2-nftables-rules # example path on mysystem, on other systems it has a different path
```

in this exanple the file '/nix/store/ngdbcld1pdh1h8zpn1541c35zv25q6r2-nftables-rules' contains the subsequent rules that will be applied to the system.

## conclusion

now i have the basics that i need to setup a simple packet filter on my nixos hosts and debug the current rule set.
i can only recommend looking into the sources given to familiarize yourself with the whole topic.

time to get hands dirty for the real project of this journey: the nixos wireguard [nftables-router](https://ripx80.de/posts/04-nftables/) with vpn support.

## docs

- [wiki](https://wiki.nftables.org/wiki-nftables/index.php/main_page)
- [netfilter hooks](https://wiki.nftables.org/wiki-nftables/index.php/Netfilter_hooks)
- [timeline log](https://git.netfilter.org/nftables/log/doc?showmsg=1) of nft development
- [nft in 10 minutes](https://wiki.nftables.org/wiki-nftables/index.php/quick_reference-nftables_in_10_minutes)
- [nftables on nixos](https://scvalex.net/posts/54/)
- [flowtables](https://wiki.nftables.org/wiki-nftables/index.php/flowtables)
- [flowtables kernel](https://docs.kernel.org/networking/nf_flowtable.html)
- [deep explaination of flowtables](https://thermalcircle.de/doku.php?id=blog:linux:flowtables_1_a_netfilter_nftables_fastpath)
- [nixos-home-router](https://francis.begyn.be/blog/nixos-home-router)
- [nixos-router](https://pavluk.org/blog/2022/01/26/nixos_router.html)
- [wireguard nftables](https://www.procustodibus.com/blog/2021/11/wireguard-nftables/)

## learned

- [difference](https://www.kernel.org/doc/documentation/networking/ip-sysctl.txt) between net.ipv4.conf.all.forwarding and net.ipv4.ip_forward.
- sysctl --system shows all system settings without a config file
- ip mangle table: it is basically used to set specific headers for ip packets to affect the routing decision made further on. like mtu or ttl.
- nixos opens automaticly dhcp ipv4 and ipv6 ports when networking.firewall.enable = true.
- nixos networking.firewall.checkReversePath is default true
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
