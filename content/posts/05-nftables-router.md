---
author: "ripx80"
title: "nftables - advacned router"
linktitle: "nftables router"
description: "configure a nixos system as a router based on nftables"
date: 2024-05-31
draft: false
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

this post deals with some advanced rules and configurations to build router based on the previous post about [nftables - basics](https://ripx80.de/posts/04-nftables/).
the focus is in general on nftables but the whole thing is build on a nixos system.

if you need additional ideas or use cases? take a look at the blog (comming soon) post.

- system: x86_64
- kernel: 6.7.9
- nixos: 23.11
- nftables: 1.0.9
- libressl-3.8.2-nc (netcat)
- wireguard

nixos modules:

- [firewall](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall.nix)
- [firewall-nftables](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall-nftables.nix)
- [nftables](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/nftables.nix)

## nft

```sh
nft flush ruleset # clear, flush the entire ruleset
nft list counters # list named counters

# nft syntax for the logging statement
nft add rule inet fw services iifname wg0 tcp dport 22 ct state new log prefix \"[nftables] new ssh accepted: \" accept comment "allow and log ssh"
```

## network struct

the general struct of the network is a central router in the internet, reachable over its public ip (example here: 80.1.1.1).
clients will connect via open wireguard **port 3000** on **eth0** to internal network **wg0** (192.168.1.0/24).
they can communicate with each other via the router and has no direct communication over a mesh network.
the traffic are routed via nat masquerade to the outsite like a vpn provider does.

- wg0:      192.168.1.0/24
- router:   192.168.1.1/32
- client 1: 192.168.1.2/32
- client 2: 192.168.1.3/32
- client 3: 192.168.1.4/32

## iif and iifname

before we start with nft rulesets and features we must understand the difference between **iif** and **iifname**.
for me it was not clear at the beginning what exactly is the difference so i used only iif because i had read its faster.
after some time i run into a problem when i update my system and the service nftables and wireguard-wg0 updated and restarted.

nftables could not be restart successful because wg0 was not available to this time.
because of this i canot log into my server anymore. the ssh service was unreacable but after a restart of the server i can **fortunately** login again.
after some deep dive sessions i learnd the [difference](https://serverfault.com/questions/985158/what-is-the-difference-between-iifname-and-iif-in-nftables) and the problem with non-static ethernet interfaces.

**iif** looks up and compares the interface index of a packet. so it uses less resources because it's a integer in the [packet](https://github.com/torvalds/linux/blob/v4.19/include/linux/skbuff.h#L628) when it pass the network stack.
so no lookup or string comparsion is needed only a comparsion of the number.
The problem is, when a interface is deleted, recreated with a new index number or it's not available at the time when nftables parse the ruleset the index is not available or not match.
index values are not reassigned again for a new created interface. it will be only increased, so the index will not match any packet anymore.

a good example when **iif** should be used is the loopback (lo) interface.
the index of this interface is garanteed, its always the first interface with normaly the index number **1**. It can not be deleted or added a second time.
this can be verified with

```sh
ip address show lo

1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
```

the first number on the left is the index number of the interface **lo**.

**iifname** on the other side does a string comparsion with the interface name to lookup the index at runtime.
this need more resources but you can create a rule for a non-existing interface or not existing at the moment nftables parse the rules.
additionaly **iifname** can match wildcards like **wg***, for all wireguard interfaces beginning with **wg**.

**what is recommended to use?**

- **iif** should be used for stable interfaces that won't change once created like physical interfaces or the loopback interface. this interface must be guaraneed at boot and when the ruleset is parsed.
- **iifname** should be used for dynamic interfaces not known at boot, not created at ruleset parsing or for wildcard matches.

to address the problem described above the wireguard interface wg0 was not available when nftables was restarted and parsed the ruleset where iif was defined for wg0.
after change to iifname on dynamic interfaces i can build the configuration on a remote system and it can be lookup indexes on runtime.

one expection is the [**ingress** hook](https://wiki.nftables.org/wiki-nftables/index.php/Netfilter_hooks) of nftables. here only iif statements are accepted. so only stable interfaces can be defined or it must be safe to define a dynamic interface like wg0.
it must be enshured that the dynamic interface is present when the ingress rules are applied. you can do that with a second nftables systemd service that is start after the wg0 interface is created.

for advanced stuff or using ingress for dynamic interfaces, dont use the nixos module.
define different systemd oneshots and combine them together when they start/stop/restart/flush.

## nftables struct

i think it's always good to know exactly who sets which rules when and to find them in one place in my config.
because of that, when i have a more advanced ruleset i overwrite all default nixos rules with a **networking.nftables.ruleSet** and flush all previous rules with **flush ruleset**.
this usually allows you to attach additional rules to the existing ruleset of nftables, which is generated by the various options in nixos.
an example of such a ruleset can be found in the previous post about nftables.

however, in order to reach the previous targets, the entire ruleset which nixos generated is discarded.

```sh
network = {
   # enable firewall, don't care about default options
  firewall.enable = true;
  nftables = {
    enable = true;
    ruleSet = ''
    # flush the entire ruleset, place at the beginning
    flush ruleset
    # append new rules here
  }
}
```

the nixos defaults will always be in the evaluated file but flushed and new rules appended.
now fresh and a clean table its time to start to do something useful.

the default struct of my tables look like this.

```sh
table inet fw {
  chain rpfilter {
    type filter hook prerouting priority mangle + 10; policy drop
    fib saddr . mark . iif oif exists accept comment "reverse path check"
  }
  chain input {
     type filter hook input priority 0; policy drop
     iif lo accept comment "trusted interfaces"
     ct state vmap { invalid : drop, established : accept, related : accept, new : jump services, untracked : jump services }
  }

  chain output {
    type filter hook output priority 0; policy drop;
    ct state vmap { invalid : drop, established : accept, related : accept, new : accept, untracked : accept } comment "allow outgoing packages"
  }
  chain services {
  }
}
```

i adopt some rules from the default nixos-fw like the **rpfilter** chain and set defaults to the chains and vmaps for the **ct state** (contrackt state).
if you want to read more in detail informations about [verdict map](https://wiki.nftables.org/wiki-nftables/index.php/Verdict_Maps_(vmaps)).
a seperate **services** chain is created to group system services like ssh or dns.

to processed these rules in the input chain is the statement **jump** for new and untracked connections.
nftables will jump to the **services** chain and look for more detailed instructions.
after processed all rules in **services** it will jump back to the position left.
note that when you use a **goto** statement instead of **jump**, nftables will not jump back to the prevoius position. if no rule match the default policy kicks in.

with this basic ruleset the firewall can be get some useful instructions.
the next sections are incremental to the ruleset above. at the end of this article you can see a full rulset of all statements.

## icmp - limit and couters

on the most maschines icmp echo requests are allowed (pong of the ping)
but its a good idea to rate limit the icmp echo-request to prevent ping-floods.
because we limit more things than icmp rates the **limit** statement will be used to create a named limit and group all limits at the beginning of the table **inet fw**.
also we want to count the number of requests and use the **counter** statement to create a unamed counter.

```sh
table inet fw {

    limit lim_icmp { rate 10/second ; comment "no ping floods, allow 10 requests per second"}

    chain input {
        icmp type echo-request limit name lim_icmp counter accept comment "no ping floods and allow pings"
    }
}
```

## services - named counters

to allow clients to connect to the services we used the **services** chain.
only the wireguard service should be reachable from the internet on **eth0**, so the wireguard clients can connect to the inner wireguard network **wg0** on port 3000.
in addition a internal dns service is run for the internal network and use a limit and a named counter for queries over udp and tcp.

```sh
table inet fw {

  limit lim_dns { rate 150/second ; comment "no dns floods, allow 150 queries per second" }

  counter cnt_dns {
    comment "count dns over udp packets"
  }
  counter cnt_dns_tcp {
    comment "count dns over tcp packets"
  }

  chain services {
    iif "eth0" udp dport 3000 accept comment "open wg port to the internet"
    iifname "wg0" udp dport 53 limit name lim_dns counter name cnt_dns accept comment "limit dns queries on interface"
    iifname "wg0" tcp dport 53 limit name lim_dns counter name cnt_dns_tcp accept comment "limit dns queries on interface"
  }
}
```

## protect sensitive servies

the ssh daemon is a sensitive service. in this setup it should be only accessable in the internal network **wg0** and not from the internet.
everytime a user create a new ssh connection this must be counted and logged to the kernel log.
to protect the service from bruteforce attacks we need a mechanism like **fail2ban** but with only nft statemens.

```sh

table inet fw {

  counter cnt_ssh {
    comment "count ssh packets"
  }

  limit lim_ssh { rate over 10/minute }

  set deny_v4 { type ipv4_addr ; flags dynamic, timeout ; timeout 5m ; comment "deny list of blocked ip addresses";}

  chain input {
    ip saddr @deny_v4 drop comment "drop all clients from blocking list"
    ct state vmap { invalid : drop, established : accept, related : accept, new : jump services, untracked : jump services }
  }

  chain services {
    iifname "wg0" tcp dport 22 ct state new, untracked limit name lim_ssh update @deny_v4 { ip saddr } comment "limit ssh connection in time to blocking list"
    iifname "wg0" tcp dport 22 ct state new counter name cnt_ssh log prefix "[nftables] new ssh connection: " accept comment "allow, log, count new ssh connections"
  }
}

```

normaly this logs are send to journald on most linux distributions and you can inspect these logs via journalctl.
the default priority is **4** for nftables logs if you have not set another priority.

```sh
journalctl -k --priority=4 # show priority level 4 like nftables
```

when you connected to the internet you will see a lot of login attempts to your ssh port. yes we a live in a bad world, because bots and scanners try to login or check your open ports.

{{< garry "keep in mind: when you forget to set the interface with iifname wg0 the ssh service will be open on all interfaces!">}}

now only ssh connections on the internal wireguard interface "wg0" are allowed. you can verify this in the kernel log or try to connect with a ssh client to eth0 and wg0.

## forwarding and nat

to allow my wireguard clients the connection to the outside world via the network interface 'eth0' i use the nat masquerading technique to route the client traffic like a vpn provider.
the first step is to enable packet forwarding in the linux kernel. on the most linux systems you can do that with sysctl or write driect to /proc.

```sh
sysctl --system
net.ipv4.conf.all.forwarding = 1
net.ipv4.conf.default.forwarding = 1
```

on a nixos system this will be done via the option **'boot.kernel.sysctl'** in the system configfile.

```nix
boot.kernel.sysctl = {
  "net.ipv4.conf.all.forwarding" = true;
  "net.ipv4.conf.default.forwarding" = true;
};
```

network address translation ([nat](https://wiki.nftables.org/wiki-nftables/index.php/Performing_Network_Address_Translation_(NAT))) will allow you to route packets to different network.
this is needed because, we want to route traffic from the wireguard network to the internet and back.

normaly nixos has an option for nat called **'networking.nat.enable'**.
if this option is true, then every packet is forwarded on every interface.

this is a bad behavior because traffic is also routed to the internal network without checking the conntrack state first.
this allows new connections to be established from the outside without a connection being initiated from the inside,
which can lead to a significant security risk.

with the option **'networking.firewall.filterForward'** this behavoir can be changed and limited.
this creates a **'forward'** and **'forward-allow'** nftable chain with different rules.
but i dont use this option because i want my own table names and advanced config.

### nat - vpn

You may be embarrassed to read the news, use public hotspots or access content that is not available in your country while in a conservative vacation destination.
what vpn providers usually offer.
to route your own traffic via the router, wireguard offers an elegant solution in combination with nat on the router.

to route internal wireguard **wg0** packets to the interface **eth0** connected direct to the internet you need two tables: **nat** and **forward**.

in the nat table you define how your packets will be rewritten to be routed.
in this case i have decided to use masquerading, a special form of source nat, where all packets source address will be translated to the ip address of the output interface **eth0**, the public ip address of my router.
this processed in netfilters postrouting, before the packet leave the system.
all nftable rules will be placed **after** the 'flush ruleset' instruction

```sh
# the nat table will configure how packages are translated (srcnat, dstnat, aso)
table ip nat {
  chain postrouting {
    # this will add the source nat postrouting hook
    type nat hook postrouting priority srcnat; policy accept;
    # input interface is the internal wireguard network 'wg0'.
    # output interface is the outgoing interface 'eth0'.
    # the source nat will be masquerade, only the ip address of your router will shown to the outside
    # all packets from wg0 will be translated/rewritten to the ip of the router
    iifname "wg0" oif "eth0" masquerade comment "from internal interfaces"
  }
}
```

now nftabls know how to translate the outgoing traffic but it needs more.
you still have to define from which interface packets should be forwarded.

{{< garry "dont do a default 'policy drop' on postrouting hook. internal redirects to loopback will fail. that is a very unfortunate state of affairs, trust me.">}}

we want to forward all traffic from **wg0** to **eth0**. this will processed in forward hook.
remember **table ip** only 'see' ipv4 packets. if you want to forward ipv4 and ipv6 use inet instead.
its a good practise to set default policy to **drop** on the **forward** chain, only defined forwarding accepted.

```sh
table ip filter {
  # need a forward chain to forward incomming packets
  chain forward {
    type filter hook forward priority 0; policy drop;
    # only new connections from wg0 to eth0 are accepted and forwarded
    iifname "wg0" oif "eth0" accept comment "only from wg0 to internet"
    # you need the reverse path for your packages, so only allow related and ethablished packts from the internet
    iif "eth0" oifname "wg0" ct state related,established accept comment "allow responses from internet"
  }
}
```

now nftables know which packets should be forwarded and how to translate/nat each packet.
to use the forward like vpn provider, all traffic from the client must be passed through the router.
a complete configuration of wireguard on the **client 1** side looks like this.

```sh
wireguard = {
  enable = true;
    interfaces = {
      wg0 = {
        ips = [ 192.168.1.2 ];
        privateKeyFile = /etc/wg/wg0;
        listenPort = 51820;
        peers = [{
          # vpn only mode, all traffic ipv4 and ipv6
          allowedIPs = [ "0.0.0.0/0" "::/0" ];
          publicKey = UIUczSljVOqle8FnOO+mp9Dmdc49ojv7559T+KdTnnE=; # example key here
          endpoint = "80.1.1.1:3000"; # example public ip of the router
        }];
    mtu = 1380;
    };
  };
};
```

maybe you have notice the **mtu = 1380** setting and you know that the default mtu size is normaly 1500 bytes.
the reduced mtu is due to the overhead of wireguard but this is a separate story (comming soon).

### nat - vpn restricted

i have some power users who would drain the entire network bandwidth of my router if all their traffic went through my router.
that's why i only want to grant this privilege to selected clients defined in my ruleset.
for this setting the previous rule must be replaced if a list of allowed ip's in the forward chain.

```sh
 table ip filter {
    chain forward {
        type filter hook forward priority 0; policy drop;
        # disable "all" forwarding rule
        # iifname "wg0" oif "eth0" accept comment "only from wg0 to internet"
        # add source address to forward
        ip saddr { 192.168.1.2, 192.168.1.3, 192.168.1.4 } oif "eth0" accept comment "only specified source ip to internet"
    }
 }
```

only the defined wireguard endpoints are forwarded. if it is neseccary the **wg0** interface can be set also in this rule.

### wg - client communication

my wireguard clients should be able to communicate with each other via the router.
because all clients are in the same virtual network **192.168.1.0/24** they dont need any nat rule.
only one forward rule is required to allow the communication.

```sh
table ip filter {
    chain forward {
      type filter hook forward priority 0; policy drop;
      # here the state will be set in a vmap as default
      ct state vmap { invalid : drop, established : accept, related : accept }
      iifname "wg0" oifname "wg0" accept comment "allow client communication inside wg0"
    }
}
```

clients can now communicate which each other over the router. this is a very simple configuration and have no limits.
the vmap on the beginning take care of the back route to response, etablished and related are accepted.
but maybe you will restrict clients inside your wireguard network to talk to each other or to be explicit do the initial connection.

```sh
table ip filter {
    chain forward {
      type filter hook forward priority 0; policy drop;
      ct state vmap { invalid : drop, established : accept, related : accept }
      iifname "wg0" oifname "wg0" jump wg-forward
    }

    chain wg-forward {
        ip saddr 192.168.1.2 ip daddr { 192.168.1.3, 192.168.1.4 } accept
        ip saddr 192.168.1.3 ip daddr { 192.168.1.2 } accept
    }
}
```

for a better overview the **wg-forward** chain is added here and the jump statement is used instead of **accept**.

the ruleset will allow the ip address **192.168.1.2** etablish a new connection to ip addresses **192.168.1.3** and **192.168.1.4**.
**192.168.1.3** can only etablish a new connection to **192.168.1.3.4**.

to finish the forwarding nat configuration here is a complete ruleset for vpn forwarding and wireguard internal client communication.

```sh
table inet nat {
    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;
        iifname "wg0" oif "eth0" masquerade comment "from internal interfaces"
    }
}

table inet vpn {
    chain forward {
        type filter hook forward priority 0; policy drop;
        ct state vmap { invalid : drop, established : accept, related : accept }
        ip saddr { 192.168.1.2, 192.168.1.3, 192.168.1.4 } oif "eth0" accept comment "only specified source ip to internet"
        iifname "wg0" oifname "wg0" jump wg-forward
    }

    chain wg-forward {
        ip saddr 192.168.1.2 ip daddr { 192.168.1.3, 192.168.1.4 } accept
        ip saddr 192.168.1.3 ip daddr { 192.168.1.2 } accept
    }
}
```

## flowtables

for the sake of completeness, i would like to list flowtables here and show their basic use.

[flowtables](https://wiki.nftables.org/wiki-nftables/index.php/Flowtables) allow you to accelerate packet forwarding in software (and in hardware if your nic supports it) by using a conntrack-based network stack bypass.
for example you can skip the default flow of rules and use the ingress flow and then redirect directly to the forward chain, too speed up your routing.

on nixos you should disable ```nix networking.nftables.checkRuleset = false;``` because the ruleset checker will not work with flowtables at the [moment](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031).
remember: only stable interfaces can be used with the **ingress hook**.

in this example the flow will go from **wg0** to **eth0** direct from **ingress** to **forward** for tcp and upd traffic.

```nix

 table inet filter {

    flowtable ft {
        hook ingress priority 0
        devices = { wg0, eth0 }
    }

    chain forward {
        type filter hook forward priority 0; policy drop;

        # enable flow offloading for better throughput
        ip protocol { tcp, udp } ct state established flow offload @ft counter
    }
}
```

note that when you use flowtables the hooks prerouting and postrouting are bypassed. you canot use a feature like masquerade with this fastpath.
a deep explaination of this topic you can find on this [blog](https://thermalcircle.de/doku.php?id=blog:linux:flowtables_1_a_netfilter_nftables_fastpath) post.

## complete ruleset

this is a blueprint for a minimal wg router to enable routing between wireguard nodes (internal wg0) communication and the internet via nat (vpn mode).
i use [define](https://wiki.nftables.org/wiki-nftables/index.php/Scripting#:~:text=%22/etc/nftables/*%22-,Defining%20variables,-You%20can%20use) to set variables at the beginning for a clean and structured ruleset.

here are some additional features included from the prevoius sections:

- flush ruleset
- nftables scripting
- named counters
- named limits
- limit max ssh connections from src_ip
- limits max conections in time
- reverse path filtering (default from nixos)
- blocking list (fail2ban replacement)
- log ssh connection to kernel log
- source nat and masquerading (vpn)
- forward specific wireguard clients to each other
- ingress filter to drop bad packages like XMAS, SYN Flood, aso

```sh
firewall.enable = true;
nftables = {
    enable = true;
    checkRuleset = false;
    ruleset = ''
    # delete all prev rules like nixos default rules
    flush ruleset

    define if_in = wg0              # 192.168.1.1/24
    define if_out = eth0            # 80.1.1.1/24
    define if_wg  = { $if_out }

    define wg_port = 3000
    define ssh = { $if_in }
    define dns = { $if_in }

    define client1 = 192.168.1.2
    define client2  = 192.168.1.3
    define client3  = 192.168.1.4

    # here i define the internal network with hosts to talk to each other
    define wg_internal = { $client1, $client2, $client3 }
    # here i define the hosts they can use this server as a vpn router to forward packages to the internet.
    define vpn_allow = { $client1, $client2 }

    table inet fw {

        counter cnt_ssh {
            comment "count ssh packets"
        }

        counter cnt_dns {
            comment "count dns packets"
        }

        counter cnt_dns_tcp {
            comment "count dns over tcp packets"
        }

        limit lim_ssh { rate over 10/minute }
        limit lim_icmp { rate 10/second ; comment "no ping floods"}
        limit lim_dns { rate 150/second ; comment "no dns floods" }

        set deny_v4 { type ipv4_addr ; flags dynamic, timeout ; timeout 5m ; comment "deny list of blocked ip addresses";}

        chain rpfilter {
            type filter hook prerouting priority mangle + 10; policy drop;
            fib saddr . mark . iif oif exists accept comment "reverse path check"
        }

        chain input {
            type filter hook input priority 0; policy drop;
            # iif is save here, because lo is a stable interface and trusted
            iif lo accept comment "trusted interfaces"
            ip saddr @deny_v4 drop comment "drop all clients from blocking list"
            icmp type echo-request limit name lim_icmp counter accept comment "No ping floods and allow pings"
            ct state vmap { invalid : drop, established : accept, related : accept, new : jump services, untracked : jump services }
        }

        chain output {
            type filter hook output priority 0; policy drop;
            ct state vmap { invalid : drop, established : accept, related : accept, new : accept, untracked : accept } comment "allow outgoing packages"
        }

        chain services {
            # iif is save here because eth0 is a physical interface created at boot
            iif $if_wg udp dport $wg_port accept comment "open wg port"

            # iifname is needed becaue wg0 is a dynamic interface
            iifname $ssh tcp dport 22 ct state new, untracked limit name lim_ssh update @deny_v4 { ip saddr } comment "limit ssh connection in time to blocking list"
            iifname $ssh tcp dport 22 meter ssh_meter { ip saddr ct count over 5 } counter drop comment "limit ssh max connections per ip"
            iifname $ssh tcp dport 22 ct state new counter name cnt_ssh log prefix "[nftables] new ssh connection: " accept comment "allow, log, count new ssh connections"

            iifname $dns udp dport 53 limit name lim_dns counter name cnt_dns accept comment "limit dns queries on interface"
            iifname $dns tcp dport 53 limit name lim_dns counter name cnt_dns_tcp accept comment "limit dns queries on interface"
        }
    }

    table inet nat {
        chain postrouting {
            # dont do a policy drop; here, internal redirects to loopback will fail
            type nat hook postrouting priority 100; policy accept;
            # mix iifname for wg0 and oif for eth0
            iifname $if_in oif $if_out masquerade comment "from internal interfaces"
        }
    }

    table inet vpn {
        chain forward {
            type filter hook forward priority 0; policy drop;
            ct state vmap { invalid : drop, established : accept, related : accept }

            ip saddr $vpn_allow oif $if_out accept comment "only specified source ip to internet"
            iif $if_out oifname $if_in ct state related,established accept comment "allow responses from internet"

            iifname $if_in oifname $if_in jump wg-forward comment "allow internal routing"
        }

        chain wg-forward {
            ip saddr $client1 ip daddr $wg_internal accept
            ip saddr $client2 ip daddr $wg_internal accept
            ip saddr $client3 ip daddr { $client2 } accept
        }
    }

    table netdev filter {
        chain ingress {
            # can be a problem here to add wg0. do this in a extra systemd oneshot ruleset for dynamic interfaces
            type filter hook ingress devices = { $if_out } priority -500
            jump ingress_filter
        }

        # Basic filter chain, devices can be configued to jump here
        chain ingress_filter {
            ip frag-off & 0x1fff != 0 counter drop comment "drop all fragments"
            tcp flags fin,psh,urg / fin,psh,urg counter packets 0 bytes 0 drop comment "drop xmas nmap packets"
            tcp flags & (fin|syn|rst|psh|ack|urg) == fin|syn|rst|psh|ack|urg counter drop comment "drop xmas packets"
            tcp flags & (fin|syn|rst|psh|ack|urg) == 0x0 counter drop comment "drop null packets"
            tcp flags syn tcp option maxseg size 1-535 counter drop comment "drop uncommon mss values"
            tcp flags & (fin|syn) == (fin|syn) counter drop comment "drop fin and syn at the same time"
            tcp flags & (syn|rst) == (syn|rst) counter drop comment "drop rst and syn at the same time"
        }
    }
'';
};

```

## testing ruleset

here are some tests to see if the ruleset work.
these are not complete or described in detail.
they are for practice purposes only and do not replace further tests.

```sh
ping -t 192.168.1.1 -l 65500 # ping flood

dog -U -n 192.168.1.1 google.de # test udp dns query
dog -T -n 192.168.1.1 google.de # test tcp dns query

ssh 192.168.1.1 # ssh counter and log entry
```

```sh
nft list counters

table inet fw {
    counter cnt_ssh {
        comment "count ssh packets"
        packets 1 bytes 60
    }
    counter cnt_dns {
        comment "count dns packets"
        packets 1 bytes 66
    }
    counter cnt_dns_tcp {
        comment "count dns over tcp packets"
        packets 1 bytes 60
    }
}
```

check for ssh log

```sh
journalctl -k --priority=4 | tail
```

```sh
nmap -sN 192.168.1.1 -p22 # counter increase by two null packets
nmap -sF 192.168.1.1 -p22 # not in counter
nmap -sX 192.168.1.1 -p22 # counter increase by two xmas
nmap -sS --scanflags SYNFIN 192.168.1.1 -p22 # URG, ACK, PSH, RST, SYN, and FIN
```

## docs

- [basic nftables introduction](https://ripx80.de/posts/04-nftables/)
- [difference](https://serverfault.com/questions/985158/what-is-the-difference-between-iifname-and-iif-in-nftables) between iif and iifname
- [flowtables on nixos](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031)
- [flowtable explaination](https://thermalcircle.de/doku.php?id=blog:linux:flowtables_1_a_netfilter_nftables_fastpath) article
- [nftables scripting](https://wiki.nftables.org/wiki-nftables/index.php/Scripting)

## learned

- masquerade: Masquerade is a special case of SNAT, where the source address is automagically set to the address of the output interface.
- redirect: By using redirect, packets will be forwarded to local machine. Is a special case of DNAT where the destination is the current machine.
- ${pkgs.iproute}/bin/ip link set mtu 1380 dev wg0 # set the mtu of wg0 interface to 1380
- journalctl -f read on the fly, journalctl -k only kernel messages like nftables, journal -k --priority=4 (show priority level 4 like nftables)
- tcpdump -i eth0 host 38.10.10.1 and not port 58432
- if you have a table this rules will added or change the ruleset like the default policy of a chain.
