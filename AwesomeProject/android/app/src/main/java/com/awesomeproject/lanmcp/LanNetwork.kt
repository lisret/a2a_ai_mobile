package com.awesomeproject.lanmcp

import java.net.Inet4Address
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.LinkProperties
import android.net.NetworkCapabilities

/**
 * Private Wi-Fi address selection.
 *
 * The service binds ONLY to the device's current private Wi-Fi IPv4 address. Any
 * address that is not site-local (RFC 1918) or is loopback/link-local is ignored, so
 * cellular, VPN and public addresses are never advertised or bound.
 */
object LanNetwork {

    const val PORT = 8765

    data class Binding(val network: Network, val address: String)

    fun privateWifiIpv4(context: Context): String? = privateWifiBinding(context)?.address

    fun privateWifiBinding(context: Context): Binding? {
        return try {
            val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return null
            val candidates = ArrayList<Binding>(4)
            for (network in manager.allNetworks) {
                val capabilities = manager.getNetworkCapabilities(network) ?: continue
                if (!capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue
                if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
                val properties: LinkProperties = manager.getLinkProperties(network) ?: continue
                for (linkAddress in properties.linkAddresses) {
                    val address = linkAddress.address
                    if (address !is Inet4Address) continue
                    if (address.isLoopbackAddress || address.isLinkLocalAddress) continue
                    if (!address.isSiteLocalAddress) continue
                    val host = address.hostAddress ?: continue
                    candidates.add(Binding(network, host))
                }
            }
            candidates.sortBy { it.address }
            candidates.firstOrNull()
        } catch (error: Exception) {
            null
        }
    }

    fun endpointFor(address: String, port: Int = PORT): String = "http://$address:$port/mcp"
}
