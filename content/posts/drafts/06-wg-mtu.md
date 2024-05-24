the overhead of wireguard breaks down as follows:

- 20-byte: IPv4 header or 40 byte IPv6 header
- 8-byte: UDP header
- 4-byte: type
- 4-byte: key index
- 8-byte: nonce
- N-byte: encrypted data
- 16-byte: authentication tag

So, if you assume 1500 byte ethernet frames, the worst case (IPv6)
winds up being 1500-(40+8+4+4+8+16), leaving N=1420 bytes. if you use only ipv4 then N=1440 bytes.
but why i set a mtu size of **1380* bytes? i get some trouble with my ssh connection
 a size of 1500 bytes but my internet provider cut 40 bytes off on some routing instance.
wireguard has