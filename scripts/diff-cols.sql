SET NOCOUNT ON;
SELECT 'ID' AS col, CAST(a.[ID] AS nvarchar(60)) AS produced_116977, CAST(b.[ID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DocumentID' AS col, CAST(a.[DocumentID] AS nvarchar(60)) AS produced_116977, CAST(b.[DocumentID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DocumentID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DocumentID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DocNumber' AS col, CAST(a.[DocNumber] AS nvarchar(60)) AS produced_116977, CAST(b.[DocNumber] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DocNumber] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DocNumber] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Status' AS col, CAST(a.[Status] AS nvarchar(60)) AS produced_116977, CAST(b.[Status] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Status] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Status] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AccountKey' AS col, CAST(a.[AccountKey] AS nvarchar(60)) AS produced_116977, CAST(b.[AccountKey] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AccountKey] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AccountKey] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AccountName' AS col, CAST(a.[AccountName] AS nvarchar(60)) AS produced_116977, CAST(b.[AccountName] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AccountName] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AccountName] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Address' AS col, CAST(a.[Address] AS nvarchar(60)) AS produced_116977, CAST(b.[Address] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Address] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Address] AS nvarchar(60)),'~')
UNION ALL
SELECT 'City' AS col, CAST(a.[City] AS nvarchar(60)) AS produced_116977, CAST(b.[City] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[City] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[City] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Phone' AS col, CAST(a.[Phone] AS nvarchar(60)) AS produced_116977, CAST(b.[Phone] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Phone] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Phone] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Batch' AS col, CAST(a.[Batch] AS nvarchar(60)) AS produced_116977, CAST(b.[Batch] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Batch] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Batch] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TerminalDoc' AS col, CAST(a.[TerminalDoc] AS nvarchar(60)) AS produced_116977, CAST(b.[TerminalDoc] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TerminalDoc] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TerminalDoc] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ValueDate' AS col, CAST(a.[ValueDate] AS nvarchar(60)) AS produced_116977, CAST(b.[ValueDate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ValueDate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ValueDate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DueDate' AS col, CAST(a.[DueDate] AS nvarchar(60)) AS produced_116977, CAST(b.[DueDate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DueDate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DueDate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'PayDate' AS col, CAST(a.[PayDate] AS nvarchar(60)) AS produced_116977, CAST(b.[PayDate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[PayDate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[PayDate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Copies' AS col, CAST(a.[Copies] AS nvarchar(60)) AS produced_116977, CAST(b.[Copies] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Copies] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Copies] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TransType' AS col, CAST(a.[TransType] AS nvarchar(60)) AS produced_116977, CAST(b.[TransType] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TransType] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TransType] AS nvarchar(60)),'~')
UNION ALL
SELECT 'VatFreeTransType' AS col, CAST(a.[VatFreeTransType] AS nvarchar(60)) AS produced_116977, CAST(b.[VatFreeTransType] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[VatFreeTransType] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[VatFreeTransType] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DiscountPrc' AS col, CAST(a.[DiscountPrc] AS nvarchar(60)) AS produced_116977, CAST(b.[DiscountPrc] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DiscountPrc] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DiscountPrc] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TFtal' AS col, CAST(a.[TFtal] AS nvarchar(60)) AS produced_116977, CAST(b.[TFtal] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TFtal] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TFtal] AS nvarchar(60)),'~')
UNION ALL
SELECT 'VatPrc' AS col, CAST(a.[VatPrc] AS nvarchar(60)) AS produced_116977, CAST(b.[VatPrc] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[VatPrc] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[VatPrc] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TFtalVatFree' AS col, CAST(a.[TFtalVatFree] AS nvarchar(60)) AS produced_116977, CAST(b.[TFtalVatFree] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TFtalVatFree] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TFtalVatFree] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TFtalVat' AS col, CAST(a.[TFtalVat] AS nvarchar(60)) AS produced_116977, CAST(b.[TFtalVat] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TFtalVat] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TFtalVat] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Reference' AS col, CAST(a.[Reference] AS nvarchar(60)) AS produced_116977, CAST(b.[Reference] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Reference] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Reference] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Remarks' AS col, CAST(a.[Remarks] AS nvarchar(60)) AS produced_116977, CAST(b.[Remarks] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Remarks] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Remarks] AS nvarchar(60)),'~')
UNION ALL
SELECT 'PrintStyle' AS col, CAST(a.[PrintStyle] AS nvarchar(60)) AS produced_116977, CAST(b.[PrintStyle] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[PrintStyle] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[PrintStyle] AS nvarchar(60)),'~')
UNION ALL
SELECT 'OriginalPrinted' AS col, CAST(a.[OriginalPrinted] AS nvarchar(60)) AS produced_116977, CAST(b.[OriginalPrinted] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[OriginalPrinted] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[OriginalPrinted] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Details' AS col, CAST(a.[Details] AS nvarchar(60)) AS produced_116977, CAST(b.[Details] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Details] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Details] AS nvarchar(60)),'~')
UNION ALL
SELECT 'StockBatch' AS col, CAST(a.[StockBatch] AS nvarchar(60)) AS produced_116977, CAST(b.[StockBatch] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[StockBatch] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[StockBatch] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Warehouse' AS col, CAST(a.[Warehouse] AS nvarchar(60)) AS produced_116977, CAST(b.[Warehouse] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Warehouse] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Warehouse] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Agent' AS col, CAST(a.[Agent] AS nvarchar(60)) AS produced_116977, CAST(b.[Agent] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Agent] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Agent] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TaxType' AS col, CAST(a.[TaxType] AS nvarchar(60)) AS produced_116977, CAST(b.[TaxType] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TaxType] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TaxType] AS nvarchar(60)),'~')
UNION ALL
SELECT 'EvalCurrency' AS col, CAST(a.[EvalCurrency] AS nvarchar(60)) AS produced_116977, CAST(b.[EvalCurrency] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[EvalCurrency] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[EvalCurrency] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Currency' AS col, CAST(a.[Currency] AS nvarchar(60)) AS produced_116977, CAST(b.[Currency] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Currency] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Currency] AS nvarchar(60)),'~')
UNION ALL
SELECT 'FatherPriceList' AS col, CAST(a.[FatherPriceList] AS nvarchar(60)) AS produced_116977, CAST(b.[FatherPriceList] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[FatherPriceList] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[FatherPriceList] AS nvarchar(60)),'~')
UNION ALL
SELECT 'SonPriceList' AS col, CAST(a.[SonPriceList] AS nvarchar(60)) AS produced_116977, CAST(b.[SonPriceList] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[SonPriceList] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[SonPriceList] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TransStore' AS col, CAST(a.[TransStore] AS nvarchar(60)) AS produced_116977, CAST(b.[TransStore] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TransStore] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TransStore] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TransAgent' AS col, CAST(a.[TransAgent] AS nvarchar(60)) AS produced_116977, CAST(b.[TransAgent] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TransAgent] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TransAgent] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ProtocolID' AS col, CAST(a.[ProtocolID] AS nvarchar(60)) AS produced_116977, CAST(b.[ProtocolID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ProtocolID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ProtocolID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExportAddr' AS col, CAST(a.[ExportAddr] AS nvarchar(60)) AS produced_116977, CAST(b.[ExportAddr] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExportAddr] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExportAddr] AS nvarchar(60)),'~')
UNION ALL
SELECT 'UseFID' AS col, CAST(a.[UseFID] AS nvarchar(60)) AS produced_116977, CAST(b.[UseFID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[UseFID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[UseFID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'BranchID' AS col, CAST(a.[BranchID] AS nvarchar(60)) AS produced_116977, CAST(b.[BranchID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[BranchID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[BranchID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Rate' AS col, CAST(a.[Rate] AS nvarchar(60)) AS produced_116977, CAST(b.[Rate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Rate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Rate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'MainRate' AS col, CAST(a.[MainRate] AS nvarchar(60)) AS produced_116977, CAST(b.[MainRate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[MainRate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[MainRate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DiscountPrcR' AS col, CAST(a.[DiscountPrcR] AS nvarchar(60)) AS produced_116977, CAST(b.[DiscountPrcR] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DiscountPrcR] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DiscountPrcR] AS nvarchar(60)),'~')
UNION ALL
SELECT 'IssueDate' AS col, CAST(a.[IssueDate] AS nvarchar(60)) AS produced_116977, CAST(b.[IssueDate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[IssueDate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[IssueDate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Quantity' AS col, CAST(a.[Quantity] AS nvarchar(60)) AS produced_116977, CAST(b.[Quantity] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Quantity] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Quantity] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Ref3' AS col, CAST(a.[Ref3] AS nvarchar(60)) AS produced_116977, CAST(b.[Ref3] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Ref3] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Ref3] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CostCode' AS col, CAST(a.[CostCode] AS nvarchar(60)) AS produced_116977, CAST(b.[CostCode] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CostCode] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CostCode] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CheqAccKey' AS col, CAST(a.[CheqAccKey] AS nvarchar(60)) AS produced_116977, CAST(b.[CheqAccKey] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CheqAccKey] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CheqAccKey] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CheqBackBy' AS col, CAST(a.[CheqBackBy] AS nvarchar(60)) AS produced_116977, CAST(b.[CheqBackBy] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CheqBackBy] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CheqBackBy] AS nvarchar(60)),'~')
UNION ALL
SELECT 'MarketingNetNum' AS col, CAST(a.[MarketingNetNum] AS nvarchar(60)) AS produced_116977, CAST(b.[MarketingNetNum] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[MarketingNetNum] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[MarketingNetNum] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ConID' AS col, CAST(a.[ConID] AS nvarchar(60)) AS produced_116977, CAST(b.[ConID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ConID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ConID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'BankPay' AS col, CAST(a.[BankPay] AS nvarchar(60)) AS produced_116977, CAST(b.[BankPay] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[BankPay] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[BankPay] AS nvarchar(60)),'~')
UNION ALL
SELECT 'InterFlag' AS col, CAST(a.[InterFlag] AS nvarchar(60)) AS produced_116977, CAST(b.[InterFlag] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[InterFlag] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[InterFlag] AS nvarchar(60)),'~')
UNION ALL
SELECT 'pikadon' AS col, CAST(a.[pikadon] AS nvarchar(60)) AS produced_116977, CAST(b.[pikadon] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[pikadon] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[pikadon] AS nvarchar(60)),'~')
UNION ALL
SELECT 'SInvPrintStyle' AS col, CAST(a.[SInvPrintStyle] AS nvarchar(60)) AS produced_116977, CAST(b.[SInvPrintStyle] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[SInvPrintStyle] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[SInvPrintStyle] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraText1' AS col, CAST(a.[ExtraText1] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraText1] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraText1] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraText1] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraText2' AS col, CAST(a.[ExtraText2] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraText2] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraText2] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraText2] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraText3' AS col, CAST(a.[ExtraText3] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraText3] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraText3] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraText3] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraText4' AS col, CAST(a.[ExtraText4] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraText4] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraText4] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraText4] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraText5' AS col, CAST(a.[ExtraText5] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraText5] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraText5] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraText5] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraSum1' AS col, CAST(a.[ExtraSum1] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraSum1] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraSum1] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraSum1] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraSum2' AS col, CAST(a.[ExtraSum2] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraSum2] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraSum2] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraSum2] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraSum3' AS col, CAST(a.[ExtraSum3] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraSum3] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraSum3] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraSum3] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CRMAcc' AS col, CAST(a.[CRMAcc] AS nvarchar(60)) AS produced_116977, CAST(b.[CRMAcc] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CRMAcc] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CRMAcc] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Contact' AS col, CAST(a.[Contact] AS nvarchar(60)) AS produced_116977, CAST(b.[Contact] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Contact] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Contact] AS nvarchar(60)),'~')
UNION ALL
SELECT 'KupaNum' AS col, CAST(a.[KupaNum] AS nvarchar(60)) AS produced_116977, CAST(b.[KupaNum] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[KupaNum] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[KupaNum] AS nvarchar(60)),'~')
UNION ALL
SELECT 'PointsBalance' AS col, CAST(a.[PointsBalance] AS nvarchar(60)) AS produced_116977, CAST(b.[PointsBalance] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[PointsBalance] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[PointsBalance] AS nvarchar(60)),'~')
UNION ALL
SELECT 'RntFlag' AS col, CAST(a.[RntFlag] AS nvarchar(60)) AS produced_116977, CAST(b.[RntFlag] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[RntFlag] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[RntFlag] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Ddeposit' AS col, CAST(a.[Ddeposit] AS nvarchar(60)) AS produced_116977, CAST(b.[Ddeposit] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Ddeposit] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Ddeposit] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Ddsum' AS col, CAST(a.[Ddsum] AS nvarchar(60)) AS produced_116977, CAST(b.[Ddsum] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Ddsum] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Ddsum] AS nvarchar(60)),'~')
UNION ALL
SELECT 'PayTotal' AS col, CAST(a.[PayTotal] AS nvarchar(60)) AS produced_116977, CAST(b.[PayTotal] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[PayTotal] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[PayTotal] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Miv' AS col, CAST(a.[Miv] AS nvarchar(60)) AS produced_116977, CAST(b.[Miv] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Miv] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Miv] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DEF_DUEDATE' AS col, CAST(a.[DEF_DUEDATE] AS nvarchar(60)) AS produced_116977, CAST(b.[DEF_DUEDATE] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DEF_DUEDATE] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DEF_DUEDATE] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DFT_ZELEM' AS col, CAST(a.[DFT_ZELEM] AS nvarchar(60)) AS produced_116977, CAST(b.[DFT_ZELEM] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DFT_ZELEM] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DFT_ZELEM] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DEF_ITEM_W' AS col, CAST(a.[DEF_ITEM_W] AS nvarchar(60)) AS produced_116977, CAST(b.[DEF_ITEM_W] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DEF_ITEM_W] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DEF_ITEM_W] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DEF_DATE3' AS col, CAST(a.[DEF_DATE3] AS nvarchar(60)) AS produced_116977, CAST(b.[DEF_DATE3] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DEF_DATE3] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DEF_DATE3] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DFT_ZELEM_ITEM' AS col, CAST(a.[DFT_ZELEM_ITEM] AS nvarchar(60)) AS produced_116977, CAST(b.[DFT_ZELEM_ITEM] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DFT_ZELEM_ITEM] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DFT_ZELEM_ITEM] AS nvarchar(60)),'~')
UNION ALL
SELECT 'LastStatus' AS col, CAST(a.[LastStatus] AS nvarchar(60)) AS produced_116977, CAST(b.[LastStatus] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[LastStatus] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[LastStatus] AS nvarchar(60)),'~')
UNION ALL
SELECT 'KUTime' AS col, CAST(a.[KUTime] AS nvarchar(60)) AS produced_116977, CAST(b.[KUTime] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[KUTime] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[KUTime] AS nvarchar(60)),'~')
UNION ALL
SELECT 'KuChange' AS col, CAST(a.[KuChange] AS nvarchar(60)) AS produced_116977, CAST(b.[KuChange] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[KuChange] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[KuChange] AS nvarchar(60)),'~')
UNION ALL
SELECT 'KuDate' AS col, CAST(a.[KuDate] AS nvarchar(60)) AS produced_116977, CAST(b.[KuDate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[KuDate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[KuDate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'KuZNum' AS col, CAST(a.[KuZNum] AS nvarchar(60)) AS produced_116977, CAST(b.[KuZNum] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[KuZNum] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[KuZNum] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DistLine' AS col, CAST(a.[DistLine] AS nvarchar(60)) AS produced_116977, CAST(b.[DistLine] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DistLine] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DistLine] AS nvarchar(60)),'~')
UNION ALL
SELECT 'FMimshak' AS col, CAST(a.[FMimshak] AS nvarchar(60)) AS produced_116977, CAST(b.[FMimshak] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[FMimshak] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[FMimshak] AS nvarchar(60)),'~')
UNION ALL
SELECT 'KupaNumFix' AS col, CAST(a.[KupaNumFix] AS nvarchar(60)) AS produced_116977, CAST(b.[KupaNumFix] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[KupaNumFix] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[KupaNumFix] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExFile' AS col, CAST(a.[ExFile] AS nvarchar(60)) AS produced_116977, CAST(b.[ExFile] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExFile] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExFile] AS nvarchar(60)),'~')
UNION ALL
SELECT 'KupaNumBaUp' AS col, CAST(a.[KupaNumBaUp] AS nvarchar(60)) AS produced_116977, CAST(b.[KupaNumBaUp] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[KupaNumBaUp] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[KupaNumBaUp] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DDComm' AS col, CAST(a.[DDComm] AS nvarchar(60)) AS produced_116977, CAST(b.[DDComm] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DDComm] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DDComm] AS nvarchar(60)),'~')
UNION ALL
SELECT 'RndSuf' AS col, CAST(a.[RndSuf] AS nvarchar(60)) AS produced_116977, CAST(b.[RndSuf] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[RndSuf] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[RndSuf] AS nvarchar(60)),'~')
UNION ALL
SELECT 'BaseOrderStockId' AS col, CAST(a.[BaseOrderStockId] AS nvarchar(60)) AS produced_116977, CAST(b.[BaseOrderStockId] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[BaseOrderStockId] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[BaseOrderStockId] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ContactMail' AS col, CAST(a.[ContactMail] AS nvarchar(60)) AS produced_116977, CAST(b.[ContactMail] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ContactMail] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ContactMail] AS nvarchar(60)),'~')
UNION ALL
SELECT 'MimshStatus' AS col, CAST(a.[MimshStatus] AS nvarchar(60)) AS produced_116977, CAST(b.[MimshStatus] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[MimshStatus] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[MimshStatus] AS nvarchar(60)),'~')
UNION ALL
SELECT 'Osek874' AS col, CAST(a.[Osek874] AS nvarchar(60)) AS produced_116977, CAST(b.[Osek874] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[Osek874] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[Osek874] AS nvarchar(60)),'~')
UNION ALL
SELECT 'RefNum' AS col, CAST(a.[RefNum] AS nvarchar(60)) AS produced_116977, CAST(b.[RefNum] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[RefNum] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[RefNum] AS nvarchar(60)),'~')
UNION ALL
SELECT 'BurdType' AS col, CAST(a.[BurdType] AS nvarchar(60)) AS produced_116977, CAST(b.[BurdType] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[BurdType] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[BurdType] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CurrStat' AS col, CAST(a.[CurrStat] AS nvarchar(60)) AS produced_116977, CAST(b.[CurrStat] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CurrStat] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CurrStat] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CloseType' AS col, CAST(a.[CloseType] AS nvarchar(60)) AS produced_116977, CAST(b.[CloseType] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CloseType] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CloseType] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CloseSum' AS col, CAST(a.[CloseSum] AS nvarchar(60)) AS produced_116977, CAST(b.[CloseSum] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CloseSum] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CloseSum] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ShopFlags' AS col, CAST(a.[ShopFlags] AS nvarchar(60)) AS produced_116977, CAST(b.[ShopFlags] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ShopFlags] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ShopFlags] AS nvarchar(60)),'~')
UNION ALL
SELECT 'VatFree' AS col, CAST(a.[VatFree] AS nvarchar(60)) AS produced_116977, CAST(b.[VatFree] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[VatFree] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[VatFree] AS nvarchar(60)),'~')
UNION ALL
SELECT 'KbMatchFlag' AS col, CAST(a.[KbMatchFlag] AS nvarchar(60)) AS produced_116977, CAST(b.[KbMatchFlag] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[KbMatchFlag] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[KbMatchFlag] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraNum1' AS col, CAST(a.[ExtraNum1] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraNum1] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraNum1] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraNum1] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraNum2' AS col, CAST(a.[ExtraNum2] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraNum2] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraNum2] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraNum2] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraDate1' AS col, CAST(a.[ExtraDate1] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraDate1] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraDate1] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraDate1] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraDate2' AS col, CAST(a.[ExtraDate2] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraDate2] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraDate2] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraDate2] AS nvarchar(60)),'~')
UNION ALL
SELECT 'RefNumFlag' AS col, CAST(a.[RefNumFlag] AS nvarchar(60)) AS produced_116977, CAST(b.[RefNumFlag] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[RefNumFlag] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[RefNumFlag] AS nvarchar(60)),'~')
UNION ALL
SELECT 'OpenBaseBase' AS col, CAST(a.[OpenBaseBase] AS nvarchar(60)) AS produced_116977, CAST(b.[OpenBaseBase] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[OpenBaseBase] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[OpenBaseBase] AS nvarchar(60)),'~')
UNION ALL
SELECT 'VatFactor' AS col, CAST(a.[VatFactor] AS nvarchar(60)) AS produced_116977, CAST(b.[VatFactor] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[VatFactor] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[VatFactor] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CloseTypeKab' AS col, CAST(a.[CloseTypeKab] AS nvarchar(60)) AS produced_116977, CAST(b.[CloseTypeKab] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CloseTypeKab] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CloseTypeKab] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ConLogID' AS col, CAST(a.[ConLogID] AS nvarchar(60)) AS produced_116977, CAST(b.[ConLogID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ConLogID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ConLogID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DocCancel' AS col, CAST(a.[DocCancel] AS nvarchar(60)) AS produced_116977, CAST(b.[DocCancel] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DocCancel] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DocCancel] AS nvarchar(60)),'~')
UNION ALL
SELECT 'StationID' AS col, CAST(a.[StationID] AS nvarchar(60)) AS produced_116977, CAST(b.[StationID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[StationID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[StationID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CloseTypeKabala' AS col, CAST(a.[CloseTypeKabala] AS nvarchar(60)) AS produced_116977, CAST(b.[CloseTypeKabala] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CloseTypeKabala] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CloseTypeKabala] AS nvarchar(60)),'~')
UNION ALL
SELECT 'CustomerOrderNo' AS col, CAST(a.[CustomerOrderNo] AS nvarchar(60)) AS produced_116977, CAST(b.[CustomerOrderNo] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[CustomerOrderNo] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[CustomerOrderNo] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DocCancelUsefID' AS col, CAST(a.[DocCancelUsefID] AS nvarchar(60)) AS produced_116977, CAST(b.[DocCancelUsefID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DocCancelUsefID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DocCancelUsefID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DocCancelDate' AS col, CAST(a.[DocCancelDate] AS nvarchar(60)) AS produced_116977, CAST(b.[DocCancelDate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DocCancelDate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DocCancelDate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'DocCancelTime' AS col, CAST(a.[DocCancelTime] AS nvarchar(60)) AS produced_116977, CAST(b.[DocCancelTime] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[DocCancelTime] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[DocCancelTime] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ExtraRemarks' AS col, CAST(a.[ExtraRemarks] AS nvarchar(60)) AS produced_116977, CAST(b.[ExtraRemarks] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ExtraRemarks] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ExtraRemarks] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TftalDlr' AS col, CAST(a.[TftalDlr] AS nvarchar(60)) AS produced_116977, CAST(b.[TftalDlr] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TftalDlr] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TftalDlr] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TftalVatDlr' AS col, CAST(a.[TftalVatDlr] AS nvarchar(60)) AS produced_116977, CAST(b.[TftalVatDlr] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TftalVatDlr] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TftalVatDlr] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TftalVatFreeDlr' AS col, CAST(a.[TftalVatFreeDlr] AS nvarchar(60)) AS produced_116977, CAST(b.[TftalVatFreeDlr] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TftalVatFreeDlr] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TftalVatFreeDlr] AS nvarchar(60)),'~')
UNION ALL
SELECT 'MasavConfirm' AS col, CAST(a.[MasavConfirm] AS nvarchar(60)) AS produced_116977, CAST(b.[MasavConfirm] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[MasavConfirm] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[MasavConfirm] AS nvarchar(60)),'~')
UNION ALL
SELECT 'PrintTypeMailSend' AS col, CAST(a.[PrintTypeMailSend] AS nvarchar(60)) AS produced_116977, CAST(b.[PrintTypeMailSend] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[PrintTypeMailSend] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[PrintTypeMailSend] AS nvarchar(60)),'~')
UNION ALL
SELECT 'MasofCreateDate' AS col, CAST(a.[MasofCreateDate] AS nvarchar(60)) AS produced_116977, CAST(b.[MasofCreateDate] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[MasofCreateDate] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[MasofCreateDate] AS nvarchar(60)),'~')
UNION ALL
SELECT 'MasofLogFrom' AS col, CAST(a.[MasofLogFrom] AS nvarchar(60)) AS produced_116977, CAST(b.[MasofLogFrom] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[MasofLogFrom] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[MasofLogFrom] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TaxApiNumber' AS col, CAST(a.[TaxApiNumber] AS nvarchar(60)) AS produced_116977, CAST(b.[TaxApiNumber] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TaxApiNumber] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TaxApiNumber] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtSum1' AS col, CAST(a.[AdtSum1] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtSum1] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtSum1] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtSum1] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtSum2' AS col, CAST(a.[AdtSum2] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtSum2] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtSum2] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtSum2] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtSum3' AS col, CAST(a.[AdtSum3] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtSum3] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtSum3] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtSum3] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtText1' AS col, CAST(a.[AdtText1] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtText1] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtText1] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtText1] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtText2' AS col, CAST(a.[AdtText2] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtText2] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtText2] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtText2] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtText3' AS col, CAST(a.[AdtText3] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtText3] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtText3] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtText3] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtNum1' AS col, CAST(a.[AdtNum1] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtNum1] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtNum1] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtNum1] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtNum2' AS col, CAST(a.[AdtNum2] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtNum2] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtNum2] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtNum2] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtNum3' AS col, CAST(a.[AdtNum3] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtNum3] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtNum3] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtNum3] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtDate1' AS col, CAST(a.[AdtDate1] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtDate1] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtDate1] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtDate1] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtDate2' AS col, CAST(a.[AdtDate2] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtDate2] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtDate2] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtDate2] AS nvarchar(60)),'~')
UNION ALL
SELECT 'AdtDate3' AS col, CAST(a.[AdtDate3] AS nvarchar(60)) AS produced_116977, CAST(b.[AdtDate3] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[AdtDate3] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[AdtDate3] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ConIssueNum' AS col, CAST(a.[ConIssueNum] AS nvarchar(60)) AS produced_116977, CAST(b.[ConIssueNum] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ConIssueNum] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ConIssueNum] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TaxApiNumberFlag' AS col, CAST(a.[TaxApiNumberFlag] AS nvarchar(60)) AS produced_116977, CAST(b.[TaxApiNumberFlag] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TaxApiNumberFlag] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TaxApiNumberFlag] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TaxApiNumberNum' AS col, CAST(a.[TaxApiNumberNum] AS nvarchar(60)) AS produced_116977, CAST(b.[TaxApiNumberNum] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TaxApiNumberNum] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TaxApiNumberNum] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TaxApiErrorText' AS col, CAST(a.[TaxApiErrorText] AS nvarchar(60)) AS produced_116977, CAST(b.[TaxApiErrorText] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TaxApiErrorText] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TaxApiErrorText] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TaxApiExtraText' AS col, CAST(a.[TaxApiExtraText] AS nvarchar(60)) AS produced_116977, CAST(b.[TaxApiExtraText] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TaxApiExtraText] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TaxApiExtraText] AS nvarchar(60)),'~')
UNION ALL
SELECT 'BaseCancelDocID' AS col, CAST(a.[BaseCancelDocID] AS nvarchar(60)) AS produced_116977, CAST(b.[BaseCancelDocID] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[BaseCancelDocID] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[BaseCancelDocID] AS nvarchar(60)),'~')
UNION ALL
SELECT 'PaymentMethodCode' AS col, CAST(a.[PaymentMethodCode] AS nvarchar(60)) AS produced_116977, CAST(b.[PaymentMethodCode] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[PaymentMethodCode] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[PaymentMethodCode] AS nvarchar(60)),'~')
UNION ALL
SELECT 'RoundingMeth' AS col, CAST(a.[RoundingMeth] AS nvarchar(60)) AS produced_116977, CAST(b.[RoundingMeth] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[RoundingMeth] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[RoundingMeth] AS nvarchar(60)),'~')
UNION ALL
SELECT 'ReceiptDonation' AS col, CAST(a.[ReceiptDonation] AS nvarchar(60)) AS produced_116977, CAST(b.[ReceiptDonation] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[ReceiptDonation] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[ReceiptDonation] AS nvarchar(60)),'~')
UNION ALL
SELECT 'TaxEmergencyNumUsed' AS col, CAST(a.[TaxEmergencyNumUsed] AS nvarchar(60)) AS produced_116977, CAST(b.[TaxEmergencyNumUsed] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[TaxEmergencyNumUsed] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[TaxEmergencyNumUsed] AS nvarchar(60)),'~')
UNION ALL
SELECT 'BankCode' AS col, CAST(a.[BankCode] AS nvarchar(60)) AS produced_116977, CAST(b.[BankCode] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[BankCode] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[BankCode] AS nvarchar(60)),'~')
UNION ALL
SELECT 'BranchCode' AS col, CAST(a.[BranchCode] AS nvarchar(60)) AS produced_116977, CAST(b.[BranchCode] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[BranchCode] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[BranchCode] AS nvarchar(60)),'~')
UNION ALL
SELECT 'BankAccount' AS col, CAST(a.[BankAccount] AS nvarchar(60)) AS produced_116977, CAST(b.[BankAccount] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[BankAccount] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[BankAccount] AS nvarchar(60)),'~')
UNION ALL
SELECT 'MarketingNet' AS col, CAST(a.[MarketingNet] AS nvarchar(60)) AS produced_116977, CAST(b.[MarketingNet] AS nvarchar(60)) AS fresh_116994 FROM Stock a CROSS JOIN Stock b WHERE a.ID=116977 AND b.ID=116994 AND ISNULL(CAST(a.[MarketingNet] AS nvarchar(60)),'~') <> ISNULL(CAST(b.[MarketingNet] AS nvarchar(60)),'~');