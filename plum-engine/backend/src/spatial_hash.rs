use dashmap::DashMap;
use crate::models::Voxel;

/// Encode (x, y, z) → u64. Each axis may range from −32 768 to +32 767.
#[inline(always)]
pub fn spatial_key(x: i32, y: i32, z: i32) -> u64 {
    let ux = (x + 32_768) as u64;
    let uy = (y + 32_768) as u64;
    let uz = (z + 32_768) as u64;
    (uz << 32) | (uy << 16) | ux
}

/// Decode a u64 key back to (x, y, z).
#[allow(dead_code)]
#[inline(always)]
pub fn decode_key(key: u64) -> (i32, i32, i32) {
    let x = (key & 0xFFFF) as i32 - 32_768;
    let y = ((key >> 16) & 0xFFFF) as i32 - 32_768;
    let z = ((key >> 32) & 0xFFFF) as i32 - 32_768;
    (x, y, z)
}

/// Lock-free spatial hash table backed by DashMap.
pub struct SpatialHash {
    inner: DashMap<u64, Voxel>,
}

impl SpatialHash {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            inner: DashMap::with_capacity(capacity),
        }
    }

    /// Provide mutable iteration over all voxels.
    /// Essential for the "Aging Loop" in WorldModel.
    #[inline]
    pub fn iter_mut(&self) -> dashmap::iter::IterMut<'_, u64, Voxel> {
        self.inner.iter_mut()
    }

    #[inline]
    pub fn insert_by_key(&self, key: u64, voxel: Voxel) {
        self.inner.insert(key, voxel);
    }

    #[inline]
    pub fn get_mut_by_key(&self, key: u64) -> Option<dashmap::mapref::one::RefMut<'_, u64, Voxel>> {
        self.inner.get_mut(&key)
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn collect_all(&self) -> Vec<Voxel> {
        self.inner.iter().map(|r| r.value().clone()).collect()
    }

    pub fn collect_changed_since(&self, since: u64) -> Vec<Voxel> {
        self.inner
            .iter()
            .filter_map(|r| {
                if r.value().last_updated_seq > since {
                    Some(r.value().clone())
                } else {
                    None
                }
            })
            .collect()
    }
}