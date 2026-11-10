// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EntryLensRegistry
/// @notice Stores compact diagnostic report fingerprints. It does not certify account security.
contract EntryLensRegistry {
    struct Record {
        address reporter;
        bytes32 reportHash;
        uint8 passed;
        uint8 total;
        uint64 timestamp;
        string clientLabel;
    }

    uint256 public recordCount;
    mapping(uint256 => Record) public records;
    mapping(address => uint256) public latestRecordIdByAccount;

    event ReportRecorded(
        uint256 indexed recordId,
        address indexed reporter,
        bytes32 indexed reportHash,
        uint8 passed,
        uint8 total,
        uint64 timestamp,
        string clientLabel
    );

    function recordReport(
        bytes32 reportHash,
        uint8 passed,
        uint8 total,
        string calldata clientLabel
    ) external returns (uint256 recordId) {
        require(reportHash != bytes32(0), "EMPTY_REPORT_HASH");
        require(total > 0 && passed <= total, "INVALID_SCORE");
        require(bytes(clientLabel).length <= 48, "LABEL_TOO_LONG");

        recordId = ++recordCount;
        uint64 timestamp = uint64(block.timestamp);
        records[recordId] = Record({
            reporter: msg.sender,
            reportHash: reportHash,
            passed: passed,
            total: total,
            timestamp: timestamp,
            clientLabel: clientLabel
        });
        latestRecordIdByAccount[msg.sender] = recordId;

        emit ReportRecorded(recordId, msg.sender, reportHash, passed, total, timestamp, clientLabel);
    }
}
