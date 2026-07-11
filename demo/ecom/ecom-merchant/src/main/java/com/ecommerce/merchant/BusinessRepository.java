package com.ecommerce.merchant;

import java.util.List;
import java.util.Optional;

public interface BusinessRepository {
    void initialize();

    BusinessRecord save(BusinessRecord record);

    Optional<BusinessRecord> findById(String id);

    List<BusinessRecord> list();
}
