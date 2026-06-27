# complex RHEL kickstart with un-modeled constructs — canonical forms for all mapped directives
text
lang en_US.UTF-8
keyboard --vckeymap=us --xlayouts='fr'
timezone Europe/Zurich --utc
zerombr
network --device=eth0 --bootproto=static --ip=10.0.0.5 --netmask=255.255.255.0 --gateway=10.0.0.1
network --device=eth1 --bootproto=dhcp --bindto=mac
rootpw --iscrypted $6$abc$def
selinux --enforcing
firewall --enabled --service=ssh
services --enabled=sshd --disabled=kdump
clearpart --all --initlabel
part /boot --fstype=xfs --size=1024
volgroup vg00 pv.01
logvol / --vgname=vg00 --name=root --size=8192
bootloader --location=mbr --append="quiet"
module --name=idm --stream=DL1
%packages --ignoremissing
@^minimal-environment
vim
-nano
%end
%post --log=/root/post.log
echo configured
%end
%addon com_redhat_kdump --enable --reserve-mb=auto
%end
